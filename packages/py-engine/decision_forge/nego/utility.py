"""Per-seat utility evaluation for Negotiation Dojo."""
from __future__ import annotations

from typing import Any, Literal, Sequence

Favor = Literal["low", "high"]


def _normalise(value: float, lo: float, hi: float, favor: Favor) -> float:
    if hi == lo:
        return 0.0
    clipped = max(lo, min(hi, value))
    ratio = (clipped - lo) / (hi - lo)
    return 1.0 - ratio if favor == "low" else ratio


def _issue_spec(name: str, issues: Sequence[dict]) -> dict | None:
    for i in issues:
        if i.get("name") == name:
            return i
    return None


def normalise_terms(terms: dict[str, Any], issues: Sequence[dict]) -> dict[str, Any]:
    """Clip continuous term values into their issue ranges; pass discrete through."""
    out: dict[str, Any] = {}
    for name, value in terms.items():
        spec = _issue_spec(name, issues)
        if spec is None:
            out[name] = value
            continue
        if spec.get("type") == "continuous" and isinstance(value, (int, float)):
            rng = spec.get("range", [None, None])
            if None not in rng:
                lo, hi = rng
                out[name] = max(lo, min(hi, float(value)))
                continue
        out[name] = value
    return out


def seat_utility(
    utility_fn: Sequence[dict],
    issues: Sequence[dict],
    terms: dict[str, Any],
    favor: Favor = "low"
) -> float:
    """Compute utility of a set of offered terms for one seat.

    Args:
        utility_fn: list of {issue, weight, shape?} rows from a seat's private
        issues: the NegoConfig issues list
        terms: the offer's terms mapping (issue_name -> value)
        favor: "low" = seat prefers lower values (buyer); "high" = prefers higher (seller)

    Returns:
        float in [0, 1] — weighted sum of per-issue normalised values.
    """
    total_weight = sum(float(row.get("weight", 0)) for row in utility_fn)
    if total_weight <= 0:
        return 0.0

    acc = 0.0
    for row in utility_fn:
        issue_name = row.get("issue")
        weight = float(row.get("weight", 0))
        shape = row.get("shape", "linear")
        spec = _issue_spec(issue_name, issues)
        if spec is None or issue_name not in terms:
            continue

        value = terms[issue_name]
        if spec.get("type") == "discrete":
            options = spec.get("options", [])
            # Discrete: rank by order in options list (first = best for "low" favor).
            if value not in options:
                continue
            idx = options.index(value)
            normalised = 1.0 - (idx / max(1, len(options) - 1)) if favor == "low" else idx / max(1, len(options) - 1)
        else:
            rng = spec.get("range", [None, None])
            if None in rng or not isinstance(value, (int, float)):
                continue
            lo, hi = rng
            normalised = _normalise(float(value), lo, hi, favor)

        if shape == "concave":
            normalised = normalised ** 0.5

        acc += (weight / total_weight) * normalised

    return max(0.0, min(1.0, acc))


def batna_value(private: dict, mc_samples: dict[str, float] | None = None) -> float:
    """Resolve a seat's BATNA — either a scalar or a ref to an MC variable.

    For Plan 4, mc_samples is not wired; pass None and we'll use the scalar.
    Scaffolding left for Plan 4.5.
    """
    batna = private.get("batna")
    if isinstance(batna, (int, float)):
        return float(batna)
    if isinstance(batna, dict) and "refMCVar" in batna:
        if mc_samples is not None:
            return float(mc_samples.get(batna["refMCVar"], 0.0))
        return 0.0
    return 0.0
