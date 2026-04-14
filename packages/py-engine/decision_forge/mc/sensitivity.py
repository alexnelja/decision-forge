"""Variance-based sensitivity analysis for Monte Carlo runs.

We ship first-order Sobol-style indices via a rank-correlation surrogate
(Spearman-squared), which is cheap (no Saltelli resampling) and interpretable:
"how much of the outcome's variability is explained by variation in this input,
ignoring interactions".

Full Sobol (including total-order indices) lives in SAlib; that's a Plan 4+
dependency if needed.
"""
from __future__ import annotations

import numpy as np


def _spearman_squared(x: np.ndarray, y: np.ndarray) -> float:
    if x.size == 0 or y.size == 0:
        return 0.0
    if x.size != y.size:
        raise ValueError("spearman: length mismatch")
    rx = _rankdata(x)
    ry = _rankdata(y)
    rho = np.corrcoef(rx, ry)[0, 1]
    if not np.isfinite(rho):
        return 0.0
    return float(rho * rho)


def _rankdata(a: np.ndarray) -> np.ndarray:
    order = np.argsort(a)
    ranks = np.empty_like(order, dtype=float)
    ranks[order] = np.arange(1, a.size + 1)
    return ranks


def sensitivity_ranking(
    variables: dict[str, np.ndarray],
    outcome: np.ndarray
) -> list[dict]:
    """Return per-variable first-order contribution to outcome variance.

    Output: list of {name, index, normalised} sorted by index descending.
    `normalised` is index / sum(index) so the slice of contributions is
    easy to read.
    """
    raw = [
        {"name": name, "index": _spearman_squared(arr, outcome)}
        for name, arr in variables.items()
    ]
    total = sum(r["index"] for r in raw) or 1.0
    for r in raw:
        r["normalised"] = r["index"] / total
    raw.sort(key=lambda r: r["index"], reverse=True)
    return raw
