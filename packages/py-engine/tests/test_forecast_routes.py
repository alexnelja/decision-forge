import uuid
from fastapi.testclient import TestClient
from decision_forge.app import create_app
from decision_forge.db import open_db, migrate
from decision_forge.routers import forecast as forecast_router


def _client(tmp_path):
    conn = open_db(str(tmp_path / "forecasts.db"))
    migrate(conn)
    forecast_router.set_connection(conn)
    app = create_app()
    return TestClient(app)


def _uuid():
    return str(uuid.uuid4())


def test_ask_list_predict_resolve_roundtrip(tmp_path):
    c = _client(tmp_path)
    qid, pid = _uuid(), _uuid()

    r = c.post("/forecast/question", json={
        "question": {
            "id": qid, "text": "Will it rain?", "createdAt": "2026-04-14T10:00:00Z",
            "resolveBy": "2026-04-20T10:00:00Z", "tags": ["weather"]
        },
        "prediction": {
            "id": pid, "questionId": qid, "probability": 0.3,
            "madeAt": "2026-04-14T10:00:00Z"
        }
    })
    assert r.status_code == 200, r.text

    r = c.get("/forecast/questions")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["id"] == qid
    assert body[0]["latestProbability"] == 0.3
    assert body[0]["resolved"] is False

    r = c.post("/forecast/resolve", json={
        "questionId": qid, "outcome": 0, "resolvedAt": "2026-04-21T10:00:00Z"
    })
    assert r.status_code == 200, r.text

    r = c.get("/forecast/calibration")
    assert r.status_code == 200
    cal = r.json()
    assert cal["count"] == 1
    assert abs(cal["brier"] - 0.09) < 1e-9


def test_predict_requires_existing_question(tmp_path):
    c = _client(tmp_path)
    r = c.post("/forecast/predict", json={
        "id": _uuid(), "questionId": _uuid(),
        "probability": 0.5, "madeAt": "2026-04-14T10:00:00Z"
    })
    assert r.status_code == 404


def test_probability_validation(tmp_path):
    c = _client(tmp_path)
    qid = _uuid()
    r = c.post("/forecast/question", json={
        "question": {
            "id": qid, "text": "Q?", "createdAt": "2026-04-14T10:00:00Z",
            "resolveBy": "2026-05-14T10:00:00Z"
        },
        "prediction": {
            "id": _uuid(), "questionId": qid, "probability": 1.5,
            "madeAt": "2026-04-14T10:00:00Z"
        }
    })
    assert r.status_code == 422
