from fastapi.testclient import TestClient

from decision_forge.app import create_app
from decision_forge.nego.agent import ScriptedDriver
from decision_forge.nego.session import SessionStore
from decision_forge.routers import nego as nego_router


def _client_with_driver(tmp_path, driver=None):
    store = SessionStore(tmp_path, driver=driver)
    nego_router.set_store(store)
    return TestClient(create_app())


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
                    "style": "hardball",
                    "patience": 0.5,
                    "deceptiveness": 0.3,
                    "model": "claude-haiku-4-5"
                }
            }
        ],
        "maxRounds": 6,
        "discountFactor": 0.95,
        "acceptanceThreshold": 0.05,
        "walkAway": True
    }


def test_start_returns_session_id(tmp_path):
    c = _client_with_driver(tmp_path)
    r = c.post("/nego/start", json={"config": _cfg()})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["id"]
    assert body["outcome"] == "active"


def test_full_flow_offer_accept(tmp_path):
    driver = ScriptedDriver(script=[{"kind": "accept", "speech": "Yes."}])
    c = _client_with_driver(tmp_path, driver=driver)
    start = c.post("/nego/start", json={"config": _cfg()}).json()
    sid = start["id"]

    r = c.post(
        f"/nego/action/{sid}",
        json={
            "action": {
                "kind": "offer",
                "offer": {"seatId": "buyer", "roundIndex": 0, "terms": {"price": 160}},
                "speech": "160."
            }
        }
    )
    assert r.status_code == 200
    body = r.json()
    assert body["outcome"] == "deal"
    assert body["dealTerms"] == {"price": 160}

    debrief = c.get(f"/nego/debrief/{sid}").json()
    assert debrief["outcome"] == "deal"
    assert debrief["utilities"]["buyer"]["utility"] > 0


def test_unknown_session_404(tmp_path):
    c = _client_with_driver(tmp_path)
    r = c.get("/nego/state/nope-not-a-uuid")
    assert r.status_code == 404
    r = c.post(
        "/nego/action/nope",
        json={"action": {"kind": "walk", "seatId": "x", "speech": "."}}
    )
    assert r.status_code == 404
