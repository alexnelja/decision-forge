import time

from fastapi.testclient import TestClient

from decision_forge.app import create_app


def _client():
    app = create_app()
    return TestClient(app)


def _cfg(**overrides):
    base = {
        "variables": [
            {"name": "a", "distribution": {"kind": "normal", "mean": 10, "sd": 2}},
            {"name": "b", "distribution": {"kind": "uniform", "min": 0, "max": 5}},
        ],
        "formula": "a + b",
        "iterations": 1000,
        "seed": 123,
    }
    base.update(overrides)
    return base


def test_run_round_trip():
    c = _client()
    r = c.post("/mc/run", json=_cfg())
    assert r.status_code == 200, r.text
    body = r.json()
    assert isinstance(body["samples"], list) and len(body["samples"]) > 0
    assert len(body["samples"]) <= 1000  # truncated for wire size
    stats = body["stats"]
    assert all(k in stats for k in ("mean", "sd", "min", "max", "p50"))
    assert body["iterations"] == 1000
    # mean of a+b ~ 10 + 2.5 = 12.5
    assert abs(stats["mean"] - 12.5) < 0.5


def test_run_seeded_is_deterministic():
    c = _client()
    a = c.post("/mc/run", json=_cfg(seed=42)).json()
    b = c.post("/mc/run", json=_cfg(seed=42)).json()
    assert a["stats"]["mean"] == b["stats"]["mean"]
    assert a["samples"][:10] == b["samples"][:10]


def test_run_unknown_name_in_formula_returns_400():
    c = _client()
    r = c.post("/mc/run", json=_cfg(formula="a + zzz"))
    assert r.status_code == 400
    assert "zzz" in r.text


def test_run_iteration_bounds_enforced_by_schema():
    c = _client()
    r = c.post("/mc/run", json=_cfg(iterations=50))
    assert r.status_code == 422  # Pydantic rejects

    r = c.post("/mc/run", json=_cfg(iterations=2_000_000))
    assert r.status_code == 422


def test_run_default_iterations_200_is_fast():
    c = _client()
    start = time.perf_counter()
    r = c.post("/mc/run", json=_cfg(iterations=200))
    elapsed = time.perf_counter() - start
    assert r.status_code == 200
    assert elapsed < 2.0  # generous
