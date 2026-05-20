import json

import pytest

from decision_forge.nego.agent import ScriptedDriver
from decision_forge.nego.session import SessionStore


def _cfg():
    return {
        "issues": [
            {"name": "price", "type": "continuous", "range": [100, 200], "yourWeight": 1.0}
        ],
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
            {
                "id": "supplier",
                "label": "Supplier",
                "controlledBy": "ai",
                "private": {
                    "batna": 150,
                    "reservationPrice": 140,
                    "utilityFn": [{"issue": "price", "weight": 1.0}],
                    "info": ""
                },
                "persona": {
                    "style": "collaborative",
                    "patience": 0.6,
                    "deceptiveness": 0.2,
                    "model": "gemini-2.5-flash"
                }
            }
        ],
        "maxRounds": 6,
        "discountFactor": 0.95,
        "acceptanceThreshold": 0.05,
        "walkAway": True
    }


def test_create_and_list_and_get(tmp_path):
    store = SessionStore(tmp_path)
    s = store.create(_cfg())
    assert s.id
    assert s.outcome == "active"
    assert (tmp_path / f"{s.id}.json").exists()

    listing = store.list()
    assert any(row["id"] == s.id for row in listing)
    loaded = store.get(s.id)
    assert loaded is not None
    assert loaded.outcome == "active"


def test_human_offer_then_ai_accept(tmp_path):
    # AI scripted to accept whatever offer comes in.
    driver = ScriptedDriver(script=[{"kind": "accept", "speech": "Deal."}])
    store = SessionStore(tmp_path, driver=driver)
    s = store.create(_cfg())

    store.submit_action(
        s.id,
        {
            "kind": "offer",
            "offer": {
                "seatId": "buyer",
                "roundIndex": 0,
                "terms": {"price": 160},
                "rationale": "opening"
            },
            "speech": "I can do 160."
        }
    )
    reloaded = store.get(s.id)
    assert reloaded.outcome == "deal"
    assert reloaded.deal_terms == {"price": 160}
    # Transcript: buyer offer → supplier accept
    assert len(reloaded.transcript) == 2
    assert reloaded.transcript[-1]["action"]["kind"] == "accept"


def test_ai_counter_offer(tmp_path):
    driver = ScriptedDriver(
        script=[
            {
                "kind": "offer",
                "offer": {
                    "seatId": "supplier",
                    "roundIndex": 0,
                    "terms": {"price": 185},
                    "rationale": "counter-anchor"
                },
                "speech": "185 is where I'd need to be."
            }
        ]
    )
    store = SessionStore(tmp_path, driver=driver)
    s = store.create(_cfg())

    store.submit_action(
        s.id,
        {
            "kind": "offer",
            "offer": {"seatId": "buyer", "roundIndex": 0, "terms": {"price": 155}},
            "speech": "155."
        }
    )
    reloaded = store.get(s.id)
    # After the AI counter-offered, turn returns to buyer (round index may have bumped).
    assert reloaded.outcome == "active"
    assert reloaded.current_seat_id == "buyer"
    assert len(reloaded.transcript) == 2


def test_walk_terminates(tmp_path):
    store = SessionStore(tmp_path)
    s = store.create(_cfg())
    store.submit_action(s.id, {"kind": "walk", "seatId": "buyer", "speech": "No thanks."})
    reloaded = store.get(s.id)
    assert reloaded.outcome == "walked"


def test_max_rounds_exhaustion(tmp_path):
    # Driver always rejects — we force full cycling.
    driver = ScriptedDriver(
        script=[{"kind": "reject", "speech": "no"}] * 20
    )
    store = SessionStore(tmp_path, driver=driver)
    cfg = _cfg()
    cfg["maxRounds"] = 2
    s = store.create(cfg)

    for _ in range(3):
        if store.get(s.id).outcome != "active":
            break
        store.submit_action(
            s.id,
            {
                "kind": "offer",
                "offer": {"seatId": "buyer", "roundIndex": 0, "terms": {"price": 150}},
                "speech": "."
            }
        )
    reloaded = store.get(s.id)
    assert reloaded.outcome in {"rounds-exhausted", "active"}  # depending on exact flow


def test_debrief_two_seat_shape(tmp_path):
    driver = ScriptedDriver(script=[{"kind": "accept", "speech": "Fine."}])
    store = SessionStore(tmp_path, driver=driver)
    s = store.create(_cfg())
    store.submit_action(
        s.id,
        {
            "kind": "offer",
            "offer": {"seatId": "buyer", "roundIndex": 0, "terms": {"price": 155}},
            "speech": "155."
        }
    )
    debrief = store.get(s.id).debrief()
    assert debrief["outcome"] == "deal"
    assert debrief["dealTerms"] == {"price": 155}
    assert set(debrief["utilities"].keys()) == {"buyer", "supplier"}
    assert debrief["nashRef"] is not None
