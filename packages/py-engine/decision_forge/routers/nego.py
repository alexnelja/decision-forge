"""Negotiation REST endpoints."""
from __future__ import annotations

import json
import os
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from decision_forge.nego.agent import GeminiDriver, ScriptedDriver
from decision_forge.nego.session import SessionStore, make_store


router = APIRouter(prefix="/nego")
_store: SessionStore | None = None


def set_store(store: SessionStore) -> None:
    global _store
    _store = store


def _default_store() -> SessionStore:
    global _store
    if _store is None:
        base = os.environ.get("DECISION_FORGE_NEGO_DIR", os.path.expanduser("~/DecisionForge/nego"))

        # Test/e2e hook — DECISION_FORGE_NEGO_SCRIPT is a JSON array of actions.
        # Takes precedence over the Gemini key so e2e runs are deterministic.
        script_env = os.environ.get("DECISION_FORGE_NEGO_SCRIPT")
        if script_env:
            try:
                script = json.loads(script_env)
                driver = ScriptedDriver(script=list(script))
                _store = SessionStore(base, driver=driver)
                return _store
            except Exception:
                # Fall through to normal path if script is malformed
                pass

        key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        _store = make_store(base, gemini_key=key)
    return _store


class StartRequest(BaseModel):
    config: dict[str, Any]
    mc_samples: dict[str, float] | None = Field(
        default=None,
        description="Pre-resolved MC variable percentiles, name → scalar. "
        "Used to back-resolve any seat BATNA expressed as {refMCVar, percentile}."
    )


class ActionRequest(BaseModel):
    action: dict[str, Any] = Field(description="NegoAction-shaped payload")


class ConfigureRequest(BaseModel):
    apiKey: str | None = None


@router.post("/configure")
def configure(body: ConfigureRequest) -> dict:
    """Hot-swap the Gemini driver at runtime. Used when the user sets the
    API key via the keychain AFTER the sidecar has already been spawned."""
    store = _default_store()
    # When a deterministic test script is active, never replace the
    # ScriptedDriver — the scripted hook wins over runtime configure, the
    # same way it wins over the env key at startup.
    if os.environ.get("DECISION_FORGE_NEGO_SCRIPT"):
        return {"driver": "scripted"}
    if body.apiKey and body.apiKey.strip():
        try:
            store.driver = GeminiDriver(api_key=body.apiKey.strip())
        except Exception as exc:
            raise HTTPException(400, f"driver init failed: {exc}")
        return {"driver": "gemini"}
    store.driver = None
    return {"driver": None}


@router.get("/health")
def nego_health() -> dict:
    store = _default_store()
    return {"driver": "gemini" if store.driver else None}


@router.post("/start")
def start(body: StartRequest) -> dict:
    store = _default_store()
    session = store.create(body.config, mc_samples=body.mc_samples)
    return session.to_dict()


@router.get("/sessions")
def list_sessions() -> list[dict]:
    return _default_store().list()


@router.get("/state/{session_id}")
def state(session_id: str) -> dict:
    session = _default_store().get(session_id)
    if session is None:
        raise HTTPException(404, "session not found")
    return session.to_dict()


@router.post("/action/{session_id}")
def submit_action(session_id: str, body: ActionRequest) -> dict:
    store = _default_store()
    try:
        session = store.submit_action(session_id, body.action)
    except KeyError:
        raise HTTPException(404, "session not found")
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except Exception as exc:
        # Surface upstream errors (Gemini API, network, etc.) with the real
        # reason instead of a generic 500 body.
        msg = str(exc)
        # Provider errors often stringify as the full JSON body; extract the
        # human 'message' field if present.
        import re
        m = re.search(r"'message': '([^']+)'", msg) or re.search(r'"message":\s*"([^"]+)"', msg)
        if m:
            msg = m.group(1)
        raise HTTPException(502, f"upstream: {msg}")
    return session.to_dict()


@router.get("/debrief/{session_id}")
def debrief(session_id: str) -> dict:
    session = _default_store().get(session_id)
    if session is None:
        raise HTTPException(404, "session not found")
    return session.debrief()
