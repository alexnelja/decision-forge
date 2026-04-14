import pytest
from decision_forge.nego.utility import seat_utility, normalise_terms


def test_linear_utility_for_buyer_on_price():
    # Buyer prefers low price. Utility on [100, 200] linear.
    utility_fn = [{"issue": "price", "weight": 1.0, "shape": "linear"}]
    issues = [{"name": "price", "type": "continuous", "range": [100, 200], "yourWeight": 1.0}]
    u_low = seat_utility(utility_fn, issues, {"price": 100}, favor="low")
    u_high = seat_utility(utility_fn, issues, {"price": 200}, favor="low")
    u_mid = seat_utility(utility_fn, issues, {"price": 150}, favor="low")
    assert u_low == pytest.approx(1.0)
    assert u_high == pytest.approx(0.0)
    assert u_mid == pytest.approx(0.5)


def test_linear_utility_for_seller_on_price():
    utility_fn = [{"issue": "price", "weight": 1.0, "shape": "linear"}]
    issues = [{"name": "price", "type": "continuous", "range": [100, 200], "yourWeight": 1.0}]
    u_low = seat_utility(utility_fn, issues, {"price": 100}, favor="high")
    u_high = seat_utility(utility_fn, issues, {"price": 200}, favor="high")
    assert u_low == pytest.approx(0.0)
    assert u_high == pytest.approx(1.0)


def test_weighted_utility_across_issues():
    utility_fn = [
        {"issue": "price", "weight": 0.7},
        {"issue": "volume", "weight": 0.3}
    ]
    issues = [
        {"name": "price", "type": "continuous", "range": [0, 100], "yourWeight": 0.7},
        {"name": "volume", "type": "continuous", "range": [0, 10], "yourWeight": 0.3}
    ]
    # Buyer favours "low" on both. Price=0 gives 1.0; volume=10 gives 0.0.
    # Weighted: 0.7 * 1.0 + 0.3 * 0.0 = 0.7
    u = seat_utility(utility_fn, issues, {"price": 0, "volume": 10}, favor="low")
    assert u == pytest.approx(0.7)

    # Inverse case: price at worst, volume at best.
    u = seat_utility(utility_fn, issues, {"price": 100, "volume": 0}, favor="low")
    assert u == pytest.approx(0.3)


def test_concave_utility_diminishing_returns():
    utility_fn = [{"issue": "price", "weight": 1.0, "shape": "concave"}]
    issues = [{"name": "price", "type": "continuous", "range": [0, 100], "yourWeight": 1.0}]
    u_mid = seat_utility(utility_fn, issues, {"price": 50}, favor="low")
    # Concave: at halfway we should already be >0.5
    assert u_mid > 0.5


def test_normalise_rounds_to_range():
    issues = [{"name": "price", "type": "continuous", "range": [100, 200], "yourWeight": 1.0}]
    terms = normalise_terms({"price": 250}, issues)
    assert terms["price"] == 200  # clipped


def test_unknown_issue_in_terms_ignored():
    utility_fn = [{"issue": "price", "weight": 1.0}]
    issues = [{"name": "price", "type": "continuous", "range": [0, 100], "yourWeight": 1.0}]
    # Extra 'garbage' term shouldn't crash
    u = seat_utility(utility_fn, issues, {"price": 0, "garbage": 42}, favor="low")
    assert u == pytest.approx(1.0)
