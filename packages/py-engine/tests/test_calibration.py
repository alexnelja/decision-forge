import math
import pytest
from decision_forge.calibration import brier_score, calibration_report


def test_brier_perfect():
    pairs = [(1.0, 1), (0.0, 0), (1.0, 1)]
    assert brier_score(pairs) == 0.0


def test_brier_worst():
    pairs = [(0.0, 1), (1.0, 0)]
    assert brier_score(pairs) == 1.0


def test_brier_midpoint():
    pairs = [(0.5, 1), (0.5, 0)]
    assert brier_score(pairs) == pytest.approx(0.25)


def test_brier_empty_raises():
    with pytest.raises(ValueError):
        brier_score([])


def test_calibration_report_buckets():
    pairs = [(0.1, 0)] * 5 + [(0.9, 1)] * 5
    r = calibration_report(pairs, n_bins=10)
    assert r["count"] == 10
    low = next(b for b in r["buckets"] if 0.05 < b["predicted"] < 0.15)
    high = next(b for b in r["buckets"] if 0.85 < b["predicted"] < 0.95)
    assert low["actual"] == 0.0 and low["n"] == 5
    assert high["actual"] == 1.0 and high["n"] == 5
    assert math.isclose(r["brier"], 0.01, abs_tol=1e-9)


def test_calibration_report_empty():
    r = calibration_report([], n_bins=10)
    assert r == {"count": 0, "brier": 0.0, "buckets": []}
