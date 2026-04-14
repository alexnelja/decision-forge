"""Summary statistics for Monte Carlo samples."""
from __future__ import annotations

import numpy as np


_PERCENTILES = (5, 10, 25, 50, 75, 90, 95, 99)


def summarise(samples: np.ndarray) -> dict:
    if samples.size == 0:
        raise ValueError("summarise requires at least one sample")
    pcts = np.percentile(samples, _PERCENTILES)
    out = {
        "mean": float(samples.mean()),
        "sd": float(samples.std(ddof=0)),
        "min": float(samples.min()),
        "max": float(samples.max()),
    }
    for p, value in zip(_PERCENTILES, pcts):
        out[f"p{p}"] = float(value)
    return out


def prob_greater_than(samples: np.ndarray, threshold: float) -> float:
    """Fraction of samples strictly greater than threshold."""
    if samples.size == 0:
        return 0.0
    return float((samples > threshold).sum() / samples.size)


def percentile_of(samples: np.ndarray, value: float) -> float:
    """Inverse of percentile: return fraction of samples <= value, clamped to [0,1]."""
    if samples.size == 0:
        return 0.0
    p = float((samples <= value).sum() / samples.size)
    return max(0.0, min(1.0, p))
