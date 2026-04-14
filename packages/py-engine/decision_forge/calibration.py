from __future__ import annotations

Pair = tuple[float, int]


def brier_score(pairs: list[Pair]) -> float:
    if not pairs:
        raise ValueError("brier_score requires at least one pair")
    return sum((p - o) ** 2 for p, o in pairs) / len(pairs)


def calibration_report(pairs: list[Pair], n_bins: int = 10) -> dict:
    if not pairs:
        return {"count": 0, "brier": 0.0, "buckets": []}

    width = 1.0 / n_bins
    bin_n = [0] * n_bins
    bin_sum_p = [0.0] * n_bins
    bin_sum_o = [0.0] * n_bins
    for p, o in pairs:
        idx = min(int(p / width), n_bins - 1)
        bin_n[idx] += 1
        bin_sum_p[idx] += p
        bin_sum_o[idx] += o

    buckets = []
    for i in range(n_bins):
        if bin_n[i] == 0:
            continue
        buckets.append({
            "predicted": bin_sum_p[i] / bin_n[i],
            "actual": bin_sum_o[i] / bin_n[i],
            "n": bin_n[i],
        })

    return {
        "count": len(pairs),
        "brier": brier_score(pairs),
        "buckets": buckets,
    }
