import numpy as np
import pytest
from decision_forge.mc.stats import summarise, prob_greater_than, percentile_of


def test_summarise_returns_expected_keys():
    samples = np.arange(1, 1001, dtype=float)  # 1..1000
    s = summarise(samples)
    for key in ("mean", "sd", "min", "max", "p5", "p10", "p25", "p50", "p75", "p90", "p95", "p99"):
        assert key in s
    assert s["min"] == 1.0
    assert s["max"] == 1000.0
    assert abs(s["mean"] - 500.5) < 1e-6
    assert abs(s["p50"] - 500.5) < 1.0


def test_summarise_empty_raises():
    with pytest.raises(ValueError):
        summarise(np.array([]))


def test_prob_greater_than():
    samples = np.array([1.0, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    assert prob_greater_than(samples, 5) == pytest.approx(0.5)
    assert prob_greater_than(samples, 0) == 1.0
    assert prob_greater_than(samples, 100) == 0.0


def test_percentile_of_uniform():
    rng = np.random.default_rng(0)
    samples = rng.uniform(0, 1, size=10_000)
    p = percentile_of(samples, 0.7)
    # fraction of samples <= 0.7 should be ~0.7
    assert abs(p - 0.7) < 0.02


def test_percentile_of_clamps_to_unit_interval():
    samples = np.array([0.0, 1.0, 2.0])
    assert percentile_of(samples, -1.0) == 0.0
    assert percentile_of(samples, 100.0) == 1.0
