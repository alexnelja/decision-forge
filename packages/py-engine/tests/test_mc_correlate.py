import numpy as np
import pytest

from decision_forge.mc.correlate import (
    correlation_matrix_from_pairs,
    induce_correlation
)
from decision_forge.mc.sampling import sample


def _rng(seed: int = 0) -> np.random.Generator:
    return np.random.default_rng(seed)


def test_correlation_matrix_from_pairs_symmetric_with_unit_diag():
    names = ["a", "b", "c"]
    pairs = {"a": {"b": 0.7}, "b": {"c": -0.4}}
    mat = correlation_matrix_from_pairs(names, pairs)
    assert mat.shape == (3, 3)
    assert np.allclose(np.diag(mat), 1.0)
    assert mat[0, 1] == pytest.approx(0.7)
    assert mat[1, 0] == pytest.approx(0.7)
    assert mat[1, 2] == pytest.approx(-0.4)
    assert mat[0, 2] == 0.0


def test_correlation_clamps_out_of_range_values():
    mat = correlation_matrix_from_pairs(["a", "b"], {"a": {"b": 2.0}})
    assert mat[0, 1] == 1.0
    mat = correlation_matrix_from_pairs(["a", "b"], {"a": {"b": -2.0}})
    assert mat[0, 1] == -1.0


def test_induce_correlation_preserves_marginals():
    """After correlation induction, sorted samples must equal sorted originals."""
    rng = _rng(42)
    n = 2000
    samples_by_name = {
        "x": sample(rng, n, {"kind": "normal", "mean": 0, "sd": 1}),
        "y": sample(rng, n, {"kind": "uniform", "min": 0, "max": 10})
    }
    target = np.array([[1.0, 0.8], [0.8, 1.0]])

    before_sorted = {k: np.sort(v.copy()) for k, v in samples_by_name.items()}
    correlated = induce_correlation(samples_by_name, target, ["x", "y"])
    for name, arr in correlated.items():
        assert np.allclose(np.sort(arr), before_sorted[name])


def test_induce_correlation_moves_toward_target():
    rng = _rng(7)
    n = 5000
    samples_by_name = {
        "x": sample(rng, n, {"kind": "normal", "mean": 0, "sd": 1}),
        "y": sample(rng, n, {"kind": "normal", "mean": 0, "sd": 1})
    }

    target_rho = 0.75
    target = np.array([[1.0, target_rho], [target_rho, 1.0]])
    correlated = induce_correlation(samples_by_name, target, ["x", "y"])

    x = correlated["x"]
    y = correlated["y"]
    pearson = np.corrcoef(x, y)[0, 1]
    # Iman-Conover gives rank corr close to target; Pearson typically within 0.1
    assert abs(pearson - target_rho) < 0.1
