"""LLM-driven negotiation agent. Calls Gemini with a persona system
instruction and constrained function calling so the model can only emit
structured actions (make_offer / accept / reject / walk).
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any, Protocol


def build_function_declarations(config: dict) -> list:
    """Build Gemini FunctionDeclarations for the four negotiation actions.

    The make_offer `terms` schema is derived from the live issue list so the
    model is constrained to valid issue names + types (and discrete options
    become an enum).
    """
    from google.genai import types

    term_props: dict[str, Any] = {}
    for issue in config.get("issues", []):
        name = issue.get("name")
        if not name:
            continue
        if issue.get("type") == "discrete":
            term_props[name] = types.Schema(
                type=types.Type.STRING,
                enum=list(issue.get("options", []))
            )
        else:
            term_props[name] = types.Schema(type=types.Type.NUMBER)

    make_offer = types.FunctionDeclaration(
        name="make_offer",
        description="Propose a set of terms to the other seats.",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "terms": types.Schema(
                    type=types.Type.OBJECT,
                    description="Proposed value for each issue.",
                    properties=term_props
                ),
                "rationale": types.Schema(
                    type=types.Type.STRING,
                    description="Brief private rationale (< 200 chars)."
                ),
                "speech": types.Schema(
                    type=types.Type.STRING,
                    description="What you say out loud to the other seats."
                )
            },
            required=["terms", "speech"]
        )
    )

    def _speech_only(name: str, description: str):
        return types.FunctionDeclaration(
            name=name,
            description=description,
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={"speech": types.Schema(type=types.Type.STRING)},
                required=["speech"]
            )
        )

    return [
        make_offer,
        _speech_only("accept", "Accept the most recent offer from another seat."),
        _speech_only("reject", "Reject the most recent offer from another seat."),
        _speech_only("walk", "Walk away from the negotiation. Ends the session.")
    ]


def function_call_to_action(name: str, args: dict, seat: dict) -> dict:
    """Map a Gemini function call into a NegoAction-shaped dict.

    Tolerates `terms` arriving as either a dict or a JSON string. Unknown
    function names fall back to a reject so the session can still advance.
    """
    args = dict(args or {})
    speech = args.get("speech", "") or ""

    if name == "make_offer":
        terms = args.get("terms", {})
        if isinstance(terms, str):
            try:
                terms = json.loads(terms)
            except (ValueError, TypeError):
                terms = {}
        if not isinstance(terms, dict):
            terms = {}
        return {
            "kind": "offer",
            "offer": {
                "seatId": seat["id"],
                "roundIndex": 0,  # filled in by orchestrator
                "terms": terms,
                "rationale": args.get("rationale")
            },
            "speech": speech
        }

    if name in ("accept", "reject", "walk"):
        return {"kind": name, "seatId": seat["id"], "speech": speech}

    # Unknown tool — default to reject so the negotiation can still advance.
    return {"kind": "reject", "seatId": seat["id"], "speech": speech or "(no move)"}


def build_persona_prompt(
    seat: dict,
    config: dict,
    mc_samples: dict[str, float] | None = None
) -> str:
    from .utility import batna_value

    persona = seat.get("persona", {}) or {}
    style = persona.get("style", "collaborative")
    patience = persona.get("patience", 0.5)
    deceptiveness = persona.get("deceptiveness", 0.3)
    private = seat.get("private", {})
    resolved_batna = batna_value(private, mc_samples)

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
  BATNA: {resolved_batna}
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
        model: str,
        mc_samples: dict[str, float] | None = None
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

    def decide(self, seat, config, transcript, model, mc_samples=None) -> dict:
        if self._idx >= len(self.script):
            return {"kind": "walk", "seatId": seat["id"], "speech": "No more responses scripted."}
        action = dict(self.script[self._idx])
        self._idx += 1
        action.setdefault("seatId", seat["id"])
        return action


def _render_history(transcript: list[dict]) -> str:
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
    return "\n".join(convo_lines) if convo_lines else "(opening move — no prior actions)"


class GeminiDriver:
    """Real driver using the Google Gemini API with constrained function calling."""

    def __init__(self, api_key: str | None = None):
        from google import genai
        key = api_key or os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        self._client = genai.Client(api_key=key)

    def decide(self, seat, config, transcript, model, mc_samples=None) -> dict:
        from google.genai import types

        system_instruction = build_persona_prompt(seat, config, mc_samples=mc_samples)
        history = _render_history(transcript)
        user_msg = (
            f"Session so far:\n{history}\n\n"
            f"It is your turn, {seat.get('label')}. "
            "Respond by calling exactly one function."
        )

        response = self._client.models.generate_content(
            model=model,
            contents=user_msg,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                max_output_tokens=1024,
                tools=[types.Tool(function_declarations=build_function_declarations(config))],
                tool_config=types.ToolConfig(
                    function_calling_config=types.FunctionCallingConfig(
                        mode=types.FunctionCallingConfigMode.ANY
                    )
                )
            )
        )

        call = _first_function_call(response)
        if call is None:
            text = (getattr(response, "text", "") or "").strip()
            return {"kind": "reject", "seatId": seat["id"], "speech": text or "(no move)"}
        return function_call_to_action(call.name, dict(call.args or {}), seat)


def _first_function_call(response: Any):
    candidates = getattr(response, "candidates", None) or []
    for cand in candidates:
        content = getattr(cand, "content", None)
        parts = getattr(content, "parts", None) or []
        for part in parts:
            fc = getattr(part, "function_call", None)
            if fc is not None:
                return fc
    return None
