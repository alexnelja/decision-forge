"""Monte Carlo distribution samplers — numpy-vectorised.

Plan 3: normal, lognormal, triangular, uniform.
Plan 3.5: PERT, empirical.
"""
from __future__ import annotations

import numpy as np


def sample_normal(
    rng: np.random.Generator, n: int, *, mean: float, sd: float
) -> np.ndarray:
    return rng.normal(loc=mean, scale=sd, size=n)


def sample_lognormal(
    rng: np.random.Generator, n: int, *, meanlog: float, sdlog: float
) -> np.ndarray:
    return rng.lognormal(mean=meanlog, sigma=sdlog, size=n)


def sample_triangular(
    rng: np.random.Generator, n: int, *, min: float, mode: float, max: float
) -> np.ndarray:
    return rng.triangular(left=min, mode=mode, right=max, size=n)


def sample_uniform(
    rng: np.random.Generator, n: int, *, min: float, max: float
) -> np.ndarray:
    return rng.uniform(low=min, high=max, size=n)


def sample_pert(
    rng: np.random.Generator,
    n: int,
    *,
    min: float,
    mode: float,
    max: float,
    lam: float = 4.0
) -> np.ndarray:
    """Beta-PERT distribution with shape parameter lam (default 4 = classic PERT).

    Derives alpha, beta from mean = (min + lam*mode + max) / (lam + 2).
    Draws from Beta then rescales to [min, max].
    """
    if max <= min:
        raise ValueError("pert requires max > min")
    span = max - min
    mean_rel = (lam * (mode - min)) / span + 1.0
    # Standard PERT α/β parametrisation
    alpha = mean_rel
    beta = lam + 2.0 - alpha
    raw = rng.beta(alpha, beta, size=n)
    return min + raw * span


def sample_empirical(
    rng: np.random.Generator, n: int, *, samples: list[float]
) -> np.ndarray:
    """Sample with replacement from an empirical dataset."""
    if not samples:
        raise ValueError("empirical sampler requires non-empty samples")
    arr = np.asarray(samples, dtype=float)
    idx = rng.integers(0, arr.size, size=n)
    return arr[idx]


_DISPATCH = {
    "normal": lambda rng, n, d: sample_normal(rng, n, mean=d["mean"], sd=d["sd"]),
    "lognormal": lambda rng, n, d: sample_lognormal(
        rng, n, meanlog=d["meanlog"], sdlog=d["sdlog"]
    ),
    "triangular": lambda rng, n, d: sample_triangular(
        rng, n, min=d["min"], mode=d["mode"], max=d["max"]
    ),
    "uniform": lambda rng, n, d: sample_uniform(rng, n, min=d["min"], max=d["max"]),
    "pert": lambda rng, n, d: sample_pert(
        rng, n, min=d["min"], mode=d["mode"], max=d["max"], lam=d.get("lambda", 4.0)
    ),
    "empirical": lambda rng, n, d: sample_empirical(rng, n, samples=d["samples"]),
}


def sample(rng: np.random.Generator, n: int, dist: dict) -> np.ndarray:
    kind = dist.get("kind")
    if kind not in _DISPATCH:
        raise ValueError(f"unsupported distribution kind: {kind!r}")
    return _DISPATCH[kind](rng, n, dist)
