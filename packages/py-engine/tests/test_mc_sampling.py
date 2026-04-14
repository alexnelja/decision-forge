import numpy as np
import pytest
from decision_forge.mc import sampling


def _rng(seed: int = 0) -> np.random.Generator:
    return np.random.default_rng(seed)


def test_sample_normal_shape_and_mean():
    samples = sampling.sample_normal(_rng(0), 10_000, mean=100, sd=15)
    assert samples.shape == (10_000,)
    assert np.all(np.isfinite(samples))
    assert abs(samples.mean() - 100) < 1.0  # tight for n=10k


def test_sample_lognormal_positive():
    samples = sampling.sample_lognormal(_rng(1), 5_000, meanlog=0.0, sdlog=0.5)
    assert samples.shape == (5_000,)
    assert np.all(samples > 0)


def test_sample_triangular_bounds():
    samples = sampling.sample_triangular(_rng(2), 5_000, min=0, mode=5, max=10)
    assert samples.min() >= 0
    assert samples.max() <= 10


def test_sample_uniform_bounds():
    samples = sampling.sample_uniform(_rng(3), 5_000, min=-1, max=1)
    assert samples.min() >= -1
    assert samples.max() <= 1


def test_dispatcher_routes_by_kind():
    s = sampling.sample(_rng(4), 100, {"kind": "normal", "mean": 0, "sd": 1})
    assert s.shape == (100,)
    s = sampling.sample(_rng(4), 100, {"kind": "uniform", "min": 0, "max": 1})
    assert s.shape == (100,)


def test_dispatcher_unsupported_kind_mentions_kind():
    with pytest.raises(ValueError, match="weibull"):
        sampling.sample(_rng(5), 10, {"kind": "weibull"})


def test_seeded_runs_are_deterministic():
    a = sampling.sample_normal(_rng(42), 1000, mean=0, sd=1)
    b = sampling.sample_normal(_rng(42), 1000, mean=0, sd=1)
    assert np.array_equal(a, b)
