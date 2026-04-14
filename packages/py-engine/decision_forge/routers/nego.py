"""Negotiation REST endpoints."""
from __future__ import annotations

import json
import os
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from decision_forge.nego.agent import AnthropicDriver, ScriptedDriver
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
        # Takes precedence over the Anthropic key so e2e runs are deterministic.
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

        key = os.environ.get("ANTHROPIC_API_KEY")
        _store = make_store(base, anthropic_key=key)
    return _store


class StartRequest(BaseModel):
    config: dict[str, Any]


class ActionRequest(BaseModel):
    action: dict[str, Any] = Field(description="NegoAction-shaped payload")


class ConfigureRequest(BaseModel):
    apiKey: str | None = None


@router.post("/configure")
def configure(body: ConfigureRequest) -> dict:
    """Hot-swap the Anthropic driver at runtime. Used when the user sets the
    API key via the keychain AFTER the sidecar has already been spawned."""
    store = _default_store()
    if body.apiKey and body.apiKey.strip():
        try:
            store.driver = AnthropicDriver(api_key=body.apiKey.strip())
        except Exception as exc:
            raise HTTPException(400, f"driver init failed: {exc}")
        return {"driver": "anthropic"}
    store.driver = None
    return {"driver": None}


@router.get("/health")
def nego_health() -> dict:
    store = _default_store()
    return {"driver": "anthropic" if store.driver else None}


@router.post("/start")
def start(body: StartRequest) -> dict:
    store = _default_store()
    session = store.create(body.config)
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
        # Surface upstream errors (Anthropic API, network, etc.) with the real
        # reason instead of a generic 500 body.
        msg = str(exc)
        # anthropic.BadRequestError stringifies as the full body; extract the
        # human 'message' field if present.
        import re
        m = re.search(r"'message': '([^']+)'", msg)
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
