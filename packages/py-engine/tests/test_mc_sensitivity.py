import numpy as np
import pytest

from decision_forge.mc.sensitivity import sensitivity_ranking


def test_single_dominant_variable_ranks_first():
    rng = np.random.default_rng(0)
    x = rng.normal(size=5000)
    noise = 0.01 * rng.normal(size=5000)
    outcome = 3 * x + noise
    ranking = sensitivity_ranking({"x": x, "noise": noise}, outcome)
    assert ranking[0]["name"] == "x"
    assert ranking[0]["index"] > ranking[1]["index"]
    assert ranking[0]["normalised"] > 0.5


def test_indices_normalised_sum_to_one():
    rng = np.random.default_rng(1)
    a = rng.normal(size=1000)
    b = rng.normal(size=1000)
    outcome = a + b
    ranking = sensitivity_ranking({"a": a, "b": b}, outcome)
    total = sum(r["normalised"] for r in ranking)
    assert total == pytest.approx(1.0)


def test_empty_inputs_return_zero_indices():
    outcome = np.array([1.0, 2.0, 3.0])
    ranking = sensitivity_ranking({"x": np.array([])}, outcome)
    assert ranking[0]["index"] == 0.0
