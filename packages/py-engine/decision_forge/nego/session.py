"""In-memory + JSON-persisted negotiation session store."""
from __future__ import annotations

import json
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .agent import AgentDriver, GeminiDriver, ScriptedDriver
from .utility import batna_value, normalise_terms, seat_utility


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _seat_favor(seat: dict, config: dict) -> str:
    """Heuristic: buyers prefer low, sellers prefer high. Infer from utilityFn sign.

    For Plan 4 we call seats with id containing 'buy' as low-favor; everyone
    else high-favor. This can be made explicit later.
    """
    sid = seat.get("id", "").lower()
    if "buy" in sid or "client" in sid or "you" == seat.get("controlledBy"):
        return "low"
    return "high"


class NegoSession:
    """One active or ended negotiation."""

    def __init__(
        self,
        config: dict,
        session_id: str | None = None,
        mc_samples: dict[str, float] | None = None
    ):
        self.id = session_id or str(uuid.uuid4())
        self.config = config
        self.mc_samples: dict[str, float] = dict(mc_samples or {})
        self.started_at = _now_iso()
        self.ended_at: str | None = None
        self.outcome = "active"
        self.deal_terms: dict[str, Any] | None = None
        self.transcript: list[dict] = []
        seats = config.get("seats", [])
        self.current_seat_id = seats[0]["id"] if seats else ""
        self.round_index = 0

    def _seat(self, seat_id: str) -> dict | None:
        for s in self.config.get("seats", []):
            if s["id"] == seat_id:
                return s
        return None

    def _last_offer(self) -> dict | None:
        for entry in reversed(self.transcript):
            if entry["action"]["kind"] == "offer":
                return entry["action"]["offer"]
        return None

    def _advance(self) -> None:
        seats = self.config.get("seats", [])
        if not seats:
            return
        ids = [s["id"] for s in seats]
        try:
            i = ids.index(self.current_seat_id)
        except ValueError:
            i = -1
        nxt = (i + 1) % len(ids)
        self.current_seat_id = ids[nxt]
        if nxt == 0:
            self.round_index += 1
        if self.round_index >= int(self.config.get("maxRounds", 10)):
            self.outcome = "rounds-exhausted"
            self.ended_at = _now_iso()

    def apply(self, action: dict) -> None:
        """Record an action. Advance turn unless it's terminal."""
        if self.outcome != "active":
            raise ValueError("session already ended")

        entry = {
            "at": _now_iso(),
            "action": action,
            "speech": action.get("speech")
        }
        self.transcript.append(entry)

        kind = action["kind"]
        if kind == "offer":
            # Normalise term values into issue ranges
            offer = action["offer"]
            issues = self.config.get("issues", [])
            offer["terms"] = normalise_terms(offer.get("terms", {}), issues)
            offer["roundIndex"] = self.round_index
            self._advance()
        elif kind == "accept":
            last = self._last_offer()
            if last is None:
                raise ValueError("no offer to accept")
            self.outcome = "deal"
            self.deal_terms = last["terms"]
            self.ended_at = _now_iso()
        elif kind == "reject":
            self._advance()
        elif kind == "walk":
            self.outcome = "walked"
            self.ended_at = _now_iso()
        elif kind == "ask_question":
            # Non-terminal, stays on same seat's turn
            pass
        else:
            raise ValueError(f"unknown action kind: {kind!r}")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "config": self.config,
            "mcSamples": self.mc_samples,
            "startedAt": self.started_at,
            "endedAt": self.ended_at,
            "outcome": self.outcome,
            "dealTerms": self.deal_terms,
            "transcript": self.transcript,
            "currentSeatId": self.current_seat_id,
            "roundIndex": self.round_index
        }

    def debrief(self) -> dict:
        """Compute per-seat utility vs BATNA. Two-seat Nash ref if applicable."""
        seats = self.config.get("seats", [])
        issues = self.config.get("issues", [])
        utilities: dict[str, dict] = {}
        for seat in seats:
            private = seat.get("private", {})
            utility = 0.0
            if self.deal_terms:
                favor = _seat_favor(seat, self.config)
                utility = seat_utility(
                    private.get("utilityFn", []), issues, self.deal_terms, favor=favor
                )
            utilities[seat["id"]] = {
                "label": seat.get("label"),
                "utility": utility,
                "batna": batna_value(private, self.mc_samples)
            }

        # Surplus above BATNA (simple: utility - normalised_batna). For Plan 4 we
        # return per-seat utility and BATNA scalar side-by-side; the Nash split
        # reference is included when there are exactly two seats.
        nash_ref = None
        if len(seats) == 2 and self.deal_terms:
            # Nash bargaining solution maximises product of gains over BATNAs.
            # Surrogate: best deal splits utility equally given scalars.
            u_a = utilities[seats[0]["id"]]["utility"]
            u_b = utilities[seats[1]["id"]]["utility"]
            nash_ref = {"equalGainTarget": (u_a + u_b) / 2}

        return {
            "outcome": self.outcome,
            "dealTerms": self.deal_terms,
            "utilities": utilities,
            "nashRef": nash_ref,
            "rounds": self.round_index,
            "transcript": self.transcript
        }


class SessionStore:
    """File-backed store. Directory layout: <base>/<id>.json."""

    def __init__(self, base_dir: str | Path, driver: AgentDriver | None = None):
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self._live: dict[str, NegoSession] = {}
        self.driver = driver

    def create(
        self,
        config: dict,
        mc_samples: dict[str, float] | None = None
    ) -> NegoSession:
        session = NegoSession(config, mc_samples=mc_samples)
        self._live[session.id] = session
        self._write(session)
        return session

    def get(self, session_id: str) -> NegoSession | None:
        if session_id in self._live:
            return self._live[session_id]
        path = self.base_dir / f"{session_id}.json"
        if not path.exists():
            return None
        data = json.loads(path.read_text())
        # Rehydrate minimally — we don't need full history replay; we rebuild.
        session = NegoSession(
            data["config"],
            session_id=data["id"],
            mc_samples=data.get("mcSamples") or {}
        )
        session.started_at = data["startedAt"]
        session.ended_at = data.get("endedAt")
        session.outcome = data.get("outcome", "active")
        session.deal_terms = data.get("dealTerms")
        session.transcript = data.get("transcript", [])
        session.current_seat_id = data.get("currentSeatId", session.current_seat_id)
        session.round_index = data.get("roundIndex", 0)
        self._live[session_id] = session
        return session

    def list(self) -> list[dict]:
        out: list[dict] = []
        for path in sorted(self.base_dir.glob("*.json")):
            try:
                data = json.loads(path.read_text())
                out.append(
                    {
                        "id": data["id"],
                        "startedAt": data["startedAt"],
                        "endedAt": data.get("endedAt"),
                        "outcome": data.get("outcome", "active"),
                        "seatLabels": [s.get("label") for s in data["config"].get("seats", [])]
                    }
                )
            except Exception:
                continue
        out.sort(key=lambda x: x["startedAt"], reverse=True)
        return out

    def submit_action(self, session_id: str, action: dict) -> NegoSession:
        session = self.get(session_id)
        if session is None:
            raise KeyError(session_id)
        session.apply(action)
        self._write(session)
        # If the next seat is AI and driver available, auto-advance.
        self._run_ai_turns(session)
        return session

    def _run_ai_turns(self, session: NegoSession, max_turns: int = 8) -> None:
        turns = 0
        while session.outcome == "active" and turns < max_turns:
            seat = session._seat(session.current_seat_id)
            if seat is None or seat.get("controlledBy") != "ai":
                break
            if self.driver is None:
                break
            model = (seat.get("persona") or {}).get("model", "gemini-2.5-pro")
            action = self.driver.decide(
                seat,
                session.config,
                session.transcript,
                model,
                mc_samples=session.mc_samples
            )
            session.apply(action)
            self._write(session)
            turns += 1

    def _write(self, session: NegoSession) -> None:
        path = self.base_dir / f"{session.id}.json"
        path.write_text(json.dumps(session.to_dict(), indent=2))


def make_store(base_dir: str, gemini_key: str | None = None) -> SessionStore:
    driver: AgentDriver | None
    if gemini_key:
        driver = GeminiDriver(api_key=gemini_key)
    else:
        driver = None
    return SessionStore(base_dir, driver=driver)
