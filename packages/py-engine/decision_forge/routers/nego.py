"""Negotiation REST endpoints."""
from __future__ import annotations

import os
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

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
        key = os.environ.get("ANTHROPIC_API_KEY")
        _store = make_store(base, anthropic_key=key)
    return _store


class StartRequest(BaseModel):
    config: dict[str, Any]


class ActionRequest(BaseModel):
    action: dict[str, Any] = Field(description="NegoAction-shaped payload")


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
    return session.to_dict()


@router.get("/debrief/{session_id}")
def debrief(session_id: str) -> dict:
    session = _default_store().get(session_id)
    if session is None:
        raise HTTPException(404, "session not found")
    return session.debrief()
