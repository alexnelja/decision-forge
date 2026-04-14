import math
import numpy as np
import pytest
from decision_forge.mc.evaluate import evaluate_formula


def test_elementwise_sum():
    result = evaluate_formula("a + b", {"a": np.array([1.0, 2, 3]), "b": np.array([10.0, 20, 30])})
    assert np.array_equal(result, np.array([11.0, 22, 33]))


def test_elementwise_product_and_constants():
    result = evaluate_formula("a * 2 + 1", {"a": np.array([1.0, 2, 3])})
    assert np.array_equal(result, np.array([3.0, 5, 7]))


def test_math_module_available_for_scalars():
    result = evaluate_formula("math.pi * a", {"a": np.array([1.0, 2, 3])})
    assert np.allclose(result, np.array([math.pi, 2 * math.pi, 3 * math.pi]))


def test_numpy_module_available():
    result = evaluate_formula("np.log(a)", {"a": np.array([1.0, math.e])})
    assert np.allclose(result, np.array([0.0, 1.0]))


def test_rejects_import():
    with pytest.raises(ValueError):
        evaluate_formula("__import__('os')", {"a": np.array([1.0])})


def test_rejects_dunder_access():
    with pytest.raises(ValueError):
        evaluate_formula("a.__class__", {"a": np.array([1.0])})


def test_rejects_syntax_error():
    with pytest.raises(ValueError):
        evaluate_formula("a +", {"a": np.array([1.0])})


def test_rejects_undefined_name():
    with pytest.raises(NameError):
        evaluate_formula("a + z", {"a": np.array([1.0])})
