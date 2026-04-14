import numpy as np
import pytest
from decision_forge.mc import sampling


def _rng(seed: int = 0) -> np.random.Generator:
    return np.random.default_rng(seed)


def test_pert_bounds_and_mode_bias():
    samples = sampling.sample_pert(_rng(0), 10_000, min=0, mode=6, max=10)
    assert samples.min() >= 0
    assert samples.max() <= 10
    # PERT should peak around the mode — mean should be close to (min + 4*mode + max)/6
    expected = (0 + 4 * 6 + 10) / 6.0  # = 5.666...
    assert abs(samples.mean() - expected) < 0.2


def test_pert_via_dispatcher():
    samples = sampling.sample(_rng(1), 1000, {"kind": "pert", "min": 10, "mode": 12, "max": 20})
    assert samples.shape == (1000,)
    assert samples.min() >= 10
    assert samples.max() <= 20


def test_pert_rejects_degenerate_range():
    with pytest.raises(ValueError):
        sampling.sample_pert(_rng(2), 100, min=5, mode=5, max=5)


def test_empirical_draws_only_from_given_samples():
    data = [1.0, 2.0, 3.0, 4.0, 5.0]
    samples = sampling.sample_empirical(_rng(3), 500, samples=data)
    assert samples.shape == (500,)
    assert set(np.unique(samples).tolist()).issubset(set(data))


def test_empirical_via_dispatcher():
    samples = sampling.sample(_rng(4), 200, {"kind": "empirical", "samples": [0.1, 0.2]})
    assert samples.shape == (200,)
    assert set(np.unique(samples).tolist()).issubset({0.1, 0.2})


def test_empirical_rejects_empty():
    with pytest.raises(ValueError):
        sampling.sample_empirical(_rng(5), 10, samples=[])
