"""Monte Carlo distribution samplers — numpy-vectorised."""
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


_DISPATCH = {
    "normal": lambda rng, n, d: sample_normal(rng, n, mean=d["mean"], sd=d["sd"]),
    "lognormal": lambda rng, n, d: sample_lognormal(
        rng, n, meanlog=d["meanlog"], sdlog=d["sdlog"]
    ),
    "triangular": lambda rng, n, d: sample_triangular(
        rng, n, min=d["min"], mode=d["mode"], max=d["max"]
    ),
    "uniform": lambda rng, n, d: sample_uniform(rng, n, min=d["min"], max=d["max"]),
}


def sample(rng: np.random.Generator, n: int, dist: dict) -> np.ndarray:
    kind = dist.get("kind")
    if kind not in _DISPATCH:
        raise ValueError(f"unsupported distribution kind: {kind!r}")
    return _DISPATCH[kind](rng, n, dist)
