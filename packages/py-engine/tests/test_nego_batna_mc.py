"""Plan 4.5 — MC → BATNA linkage: backend wiring."""
from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from decision_forge.nego.agent import ScriptedDriver, build_persona_prompt
from decision_forge.nego.session import SessionStore
from decision_forge.nego.utility import batna_value


# --- batna_value resolver -------------------------------------------------


def test_batna_value_resolves_refmcvar_from_mc_samples():
    private = {"batna": {"refMCVar": "price", "percentile": 90}}
    samples = {"price": 5800.0}
    assert batna_value(private, samples) == pytest.approx(5800.0)


def test_batna_value_refmcvar_without_mc_samples_returns_zero():
    private = {"batna": {"refMCVar": "price", "percentile": 50}}
    # No mc_samples passed — must not raise, falls back to 0.0 for safety
    assert batna_value(private) == 0.0


def test_batna_value_scalar_still_works():
    assert batna_value({"batna": 175}) == 175.0


# --- prompt resolution ----------------------------------------------------


def _ai_seat(batna):
    return {
        "id": "supplier",
        "label": "Supplier",
        "controlledBy": "ai",
        "private": {
            "batna": batna,
            "reservationPrice": 140,
            "utilityFn": [{"issue": "price", "weight": 1.0}],
            "info": ""
        },
        "persona": {
            "style": "analytical",
            "patience": 0.7,
            "deceptiveness": 0.2,
            "model": "gemini-2.5-flash"
        }
    }


def _config(batna):
    return {
        "issues": [{"name": "price", "type": "continuous", "range": [100, 200], "yourWeight": 1.0}],
        "seats": [
            {
                "id": "buyer",
                "label": "Buyer",
                "controlledBy": "you",
                "private": {
                    "batna": 180,
                    "reservationPrice": 175,
                    "utilityFn": [{"issue": "price", "weight": 1.0}],
                    "info": ""
                }
            },
            _ai_seat(batna)
        ],
        "maxRounds": 4,
        "discountFactor": 0.95,
        "acceptanceThreshold": 0.05,
        "walkAway": True
    }


def test_persona_prompt_emits_resolved_scalar_for_refmcvar():
    cfg = _config({"refMCVar": "price", "percentile": 90})
    samples = {"price": 158.4}
    text = build_persona_prompt(cfg["seats"][1], cfg, mc_samples=samples)
    assert "158.4" in text, f"expected resolved scalar in prompt; got: {text}"
    # Must not leak the dict literal
    assert "refMCVar" not in text


def test_persona_prompt_scalar_batna_unchanged():
    cfg = _config(150)
    text = build_persona_prompt(cfg["seats"][1], cfg, mc_samples=None)
    assert "150" in text


def test_persona_prompt_refmcvar_without_samples_renders_zero():
    cfg = _config({"refMCVar": "price", "percentile": 50})
    text = build_persona_prompt(cfg["seats"][1], cfg, mc_samples=None)
    # Backend falls back to 0.0; prompt must still hide the dict literal
    assert "refMCVar" not in text


# --- session.create + persistence -----------------------------------------


def test_session_create_accepts_and_persists_mc_samples(tmp_path):
    store = SessionStore(tmp_path)
    samples = {"price": 158.4, "shipping": 22.0}
    session = store.create(_config({"refMCVar": "price", "percentile": 90}), mc_samples=samples)
    assert session.mc_samples == samples

    # Persisted JSON contains them
    data = json.loads((tmp_path / f"{session.id}.json").read_text())
    assert data["mcSamples"] == samples


def test_session_create_default_mc_samples_is_empty(tmp_path):
    store = SessionStore(tmp_path)
    session = store.create(_config(150))
    assert session.mc_samples == {}


def test_session_get_rehydrates_mc_samples(tmp_path):
    store1 = SessionStore(tmp_path)
    samples = {"price": 158.4}
    sid = store1.create(_config({"refMCVar": "price", "percentile": 90}), mc_samples=samples).id

    # Drop and reload
    store2 = SessionStore(tmp_path)
    rehydrated = store2.get(sid)
    assert rehydrated is not None
    assert rehydrated.mc_samples == samples


# --- debrief uses mc_samples ----------------------------------------------


def test_debrief_resolves_refmcvar_batna(tmp_path):
    store = SessionStore(tmp_path)
    samples = {"price": 158.4}
    session = store.create(
        _config({"refMCVar": "price", "percentile": 90}),
        mc_samples=samples
    )
    debrief = session.debrief()
    assert debrief["utilities"]["supplier"]["batna"] == pytest.approx(158.4)


# --- AI turn threads samples to driver ------------------------------------


class _RecordingDriver:
    """Captures the mc_samples passed at decide time."""

    def __init__(self):
        self.calls = []

    def decide(self, seat, config, transcript, model, mc_samples=None):
        self.calls.append({"seat": seat["id"], "mc_samples": mc_samples})
        return {"kind": "walk", "seatId": seat["id"], "speech": "out."}


def test_ai_turn_threads_mc_samples_to_driver(tmp_path):
    driver = _RecordingDriver()
    store = SessionStore(tmp_path, driver=driver)
    samples = {"price": 158.4}
    session = store.create(
        _config({"refMCVar": "price", "percentile": 90}),
        mc_samples=samples
    )

    # Trigger AI turn by submitting a buyer offer first (supplier is AI)
    store.submit_action(
        session.id,
        {
            "kind": "offer",
            "offer": {"seatId": "buyer", "roundIndex": 0, "terms": {"price": 160}}
        }
    )

    assert len(driver.calls) >= 1
    assert driver.calls[0]["seat"] == "supplier"
    assert driver.calls[0]["mc_samples"] == samples


# --- /nego/start route ----------------------------------------------------


def test_nego_start_accepts_mc_samples(tmp_path, monkeypatch):
    from decision_forge.app import create_app
    from decision_forge.routers import nego as nego_router

    # Override the store with a tmp-dir one (no driver — buyer goes first, no AI turn)
    test_store = SessionStore(tmp_path)
    nego_router.set_store(test_store)

    samples = {"price": 158.4, "shipping": 22.0}
    cfg = _config({"refMCVar": "price", "percentile": 90})

    client = TestClient(create_app())
    resp = client.post("/nego/start", json={"config": cfg, "mc_samples": samples})
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["mcSamples"] == samples


def test_nego_start_without_mc_samples_works(tmp_path):
    from decision_forge.app import create_app
    from decision_forge.routers import nego as nego_router

    nego_router.set_store(SessionStore(tmp_path))
    client = TestClient(create_app())
    resp = client.post("/nego/start", json={"config": _config(150)})
    assert resp.status_code == 200, resp.text
    assert resp.json()["mcSamples"] == {}
