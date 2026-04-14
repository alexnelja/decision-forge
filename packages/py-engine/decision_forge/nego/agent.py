"""LLM-driven negotiation agent. Calls Anthropic with a persona prompt
and constrained tool use so the model can only emit structured actions.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any, Protocol


_TOOLS = [
    {
        "name": "make_offer",
        "description": "Propose a set of terms to the other seats.",
        "input_schema": {
            "type": "object",
            "properties": {
                "terms": {
                    "type": "object",
                    "description": "Mapping of issue name to proposed value.",
                    "additionalProperties": True
                },
                "rationale": {
                    "type": "string",
                    "description": "Brief private rationale for this offer (< 200 chars)."
                },
                "speech": {
                    "type": "string",
                    "description": "What you say out loud to the other seats."
                }
            },
            "required": ["terms", "speech"]
        }
    },
    {
        "name": "accept",
        "description": "Accept the most recent offer from another seat.",
        "input_schema": {
            "type": "object",
            "properties": {
                "speech": {"type": "string"}
            },
            "required": ["speech"]
        }
    },
    {
        "name": "reject",
        "description": "Reject the most recent offer from another seat.",
        "input_schema": {
            "type": "object",
            "properties": {
                "speech": {"type": "string"}
            },
            "required": ["speech"]
        }
    },
    {
        "name": "walk",
        "description": "Walk away from the negotiation. Ends the session.",
        "input_schema": {
            "type": "object",
            "properties": {
                "speech": {"type": "string"}
            },
            "required": ["speech"]
        }
    }
]


def build_persona_prompt(seat: dict, config: dict) -> str:
    persona = seat.get("persona", {}) or {}
    style = persona.get("style", "collaborative")
    patience = persona.get("patience", 0.5)
    deceptiveness = persona.get("deceptiveness", 0.3)
    private = seat.get("private", {})

    style_guides = {
        "hardball": "Aggressive, willing to make extreme anchors. Slow concession.",
        "collaborative": "Seek integrative outcomes. Look for trades across issues.",
        "risk-averse": "Prefer certainty. Discount future value steeply. Concede earlier.",
        "analytical": "Calculate utility explicitly. Reason about the other's constraints.",
        "emotional": "Show frustration, enthusiasm, or concern. Less Nash, more theatre."
    }
    style_desc = style_guides.get(style, style_guides["collaborative"])

    return f"""You play the seat "{seat.get('label')}" in a multi-round negotiation.

Style: {style}. {style_desc}
Patience (0-1): {patience:.2f} — higher means more willing to wait for a better deal.
Deceptiveness (0-1): {deceptiveness:.2f} — higher means you may hide your true BATNA and reservation price.

PRIVATE (never reveal verbatim; reason about but don't quote):
  BATNA: {private.get('batna')}
  Reservation price: {private.get('reservationPrice')}
  Utility function: {json.dumps(private.get('utilityFn', []))}
  Intel: {private.get('info', '')}

Issues (shared): {json.dumps(config.get('issues', []))}
Max rounds: {config.get('maxRounds')}
Discount factor per round: {config.get('discountFactor')}

Rules:
- You MUST respond by invoking exactly one tool (make_offer, accept, reject, walk).
- 'speech' is the public line; be natural, in-character, brief.
- 'rationale' (on make_offer) is a private note for your own future-self; <200 chars.
- If an offer would net you less utility than your BATNA and the discount factor has eaten much of future value, consider walking.
- Keep 'terms' keys exactly matching issue names.

{persona.get('customPrompt', '')}
"""


class AgentDriver(Protocol):
    def decide(
        self,
        seat: dict,
        config: dict,
        transcript: list[dict],
        model: str
    ) -> dict:
        """Return {'kind': 'offer'|'accept'|'reject'|'walk', ...shape per NegoAction}.
        Includes 'speech' and optional 'rationale'.
        """
        ...


@dataclass
class ScriptedDriver:
    """Deterministic driver for tests. Feed it a list of actions to return in order."""

    script: list[dict]
    _idx: int = 0

    def decide(self, seat, config, transcript, model) -> dict:
        if self._idx >= len(self.script):
            return {"kind": "walk", "seatId": seat["id"], "speech": "No more responses scripted."}
        action = dict(self.script[self._idx])
        self._idx += 1
        action.setdefault("seatId", seat["id"])
        return action


class AnthropicDriver:
    """Real driver using the Anthropic API. Prompt-cached persona messages."""

    def __init__(self, api_key: str | None = None):
        from anthropic import Anthropic
        self._client = Anthropic(api_key=api_key or os.environ.get("ANTHROPIC_API_KEY"))

    def decide(self, seat, config, transcript, model) -> dict:
        system = [
            {
                "type": "text",
                "text": build_persona_prompt(seat, config),
                "cache_control": {"type": "ephemeral"}
            }
        ]

        # Render transcript as a conversation history summary.
        convo_lines = []
        for entry in transcript:
            action = entry.get("action", {})
            kind = action.get("kind")
            sid = action.get("seatId") or action.get("offer", {}).get("seatId", "?")
            speech = entry.get("speech") or ""
            if kind == "offer":
                terms = action.get("offer", {}).get("terms", {})
                convo_lines.append(f"[{sid}] OFFER {json.dumps(terms)} — {speech}")
            elif kind == "accept":
                convo_lines.append(f"[{sid}] ACCEPT — {speech}")
            elif kind == "reject":
                convo_lines.append(f"[{sid}] REJECT — {speech}")
            elif kind == "walk":
                convo_lines.append(f"[{sid}] WALK — {speech}")

        history = "\n".join(convo_lines) if convo_lines else "(opening move — no prior actions)"
        user_msg = f"Session so far:\n{history}\n\nIt is your turn, {seat.get('label')}. Respond by invoking exactly one tool."

        response = self._client.messages.create(
            model=model,
            max_tokens=1024,
            system=system,
            tools=_TOOLS,
            tool_choice={"type": "any"},
            messages=[{"role": "user", "content": user_msg}]
        )

        tool_use = next(
            (b for b in response.content if getattr(b, "type", None) == "tool_use"),
            None
        )
        if tool_use is None:
            # No tool call — default to reject with the text content as speech
            text = ""
            for b in response.content:
                if getattr(b, "type", None) == "text":
                    text += getattr(b, "text", "")
            return {"kind": "reject", "seatId": seat["id"], "speech": text or "(no move)"}

        inp = tool_use.input or {}
        if tool_use.name == "make_offer":
            return {
                "kind": "offer",
                "offer": {
                    "seatId": seat["id"],
                    "roundIndex": 0,  # filled in by orchestrator
                    "terms": inp.get("terms", {}),
                    "rationale": inp.get("rationale")
                },
                "speech": inp.get("speech", "")
            }
        return {
            "kind": tool_use.name,  # "accept" | "reject" | "walk"
            "seatId": seat["id"],
            "speech": inp.get("speech", "")
        }
