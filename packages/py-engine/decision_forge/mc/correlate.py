"""Induce rank correlations between independent samples using Iman-Conover.

Preserves each variable's marginal distribution exactly while imposing a
specified rank correlation matrix. Reference: Iman & Conover (1982).
"""
from __future__ import annotations

import numpy as np


def induce_correlation(
    samples_by_name: dict[str, np.ndarray],
    target: np.ndarray,
    names: list[str]
) -> dict[str, np.ndarray]:
    """
    Args:
        samples_by_name: each variable's independent samples (same length)
        target: symmetric correlation matrix (len(names) x len(names)); diagonal = 1
        names: ordered list of variable names matching target rows/cols

    Returns:
        Dict with same keys; marginals preserved; joint correlation ≈ target.
    """
    n = len(names)
    if n == 0:
        return dict(samples_by_name)

    size = len(samples_by_name[names[0]])
    # Sanity — all lengths equal
    for name in names:
        if len(samples_by_name[name]) != size:
            raise ValueError(f"sample length mismatch for {name}")

    # Van der Waerden scores — normalised ranks → standard normal quantiles
    rng = np.random.default_rng(0)
    ranks = np.column_stack([
        rng.permutation(size) + 1 for _ in range(n)
    ]).astype(float)
    # Translate ranks to approximate normal scores via inverse CDF.
    # We use a cheap ppf approximation with rank/(size+1) → Φ⁻¹.
    from math import sqrt
    def ppf(p):
        # Beasley-Springer-Moro approximation — adequate for non-critical MC.
        return np.sqrt(2) * _erfinv(2 * p - 1)
    probs = ranks / (size + 1.0)
    scores = ppf(probs)

    # Cholesky of target correlation matrix
    L = np.linalg.cholesky(target)
    correlated_scores = scores @ L.T

    # Rank-match each marginal to the correlated scores
    out: dict[str, np.ndarray] = {}
    for i, name in enumerate(names):
        original = samples_by_name[name]
        sorted_orig = np.sort(original)
        target_order = np.argsort(np.argsort(correlated_scores[:, i]))
        out[name] = sorted_orig[target_order]
    return out


def _erfinv(x: np.ndarray) -> np.ndarray:
    """Approximate inverse error function (Winitzki 2008)."""
    a = 0.147
    ln = np.log(1.0 - x * x)
    term = 2.0 / (np.pi * a) + ln / 2.0
    return np.sign(x) * np.sqrt(np.sqrt(term * term - ln / a) - term)


def correlation_matrix_from_pairs(
    names: list[str], pairs: dict[str, dict[str, float]]
) -> np.ndarray:
    """Build a symmetric correlation matrix from a sparse variable→{variable:rho} dict.

    Missing entries default to 0. Diagonal set to 1.
    """
    n = len(names)
    mat = np.eye(n)
    idx = {name: i for i, name in enumerate(names)}
    for a, partners in (pairs or {}).items():
        if a not in idx:
            continue
        for b, rho in partners.items():
            if b not in idx:
                continue
            i, j = idx[a], idx[b]
            mat[i, j] = max(-1.0, min(1.0, float(rho)))
            mat[j, i] = mat[i, j]
    return mat
