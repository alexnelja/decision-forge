"""Restricted formula evaluator for Monte Carlo outcome expressions."""
from __future__ import annotations

import ast
import math
from typing import Mapping

import numpy as np


_SAFE_GLOBALS: dict = {
    "__builtins__": {},
    "math": math,
    "np": np,
    "min": min,
    "max": max,
    "abs": abs,
}


def _reject_dunder(tree: ast.AST) -> None:
    """Walk AST and reject any identifier starting with underscore (except params)."""
    for node in ast.walk(tree):
        if isinstance(node, ast.Attribute) and node.attr.startswith("_"):
            raise ValueError(f"dunder/private attribute not allowed: {node.attr!r}")
        if isinstance(node, ast.Name) and node.id.startswith("_"):
            raise ValueError(f"underscore-prefixed name not allowed: {node.id!r}")


def evaluate_formula(formula: str, variables: Mapping[str, np.ndarray]) -> np.ndarray:
    """Compile and evaluate `formula` with `variables` as locals.

    Raises:
        ValueError: on syntax errors or disallowed constructs.
        NameError: on undefined variable references.
    """
    try:
        tree = ast.parse(formula, mode="eval")
    except SyntaxError as exc:
        raise ValueError(f"invalid formula syntax: {exc}") from exc

    _reject_dunder(tree)

    try:
        code = compile(tree, "<mc-formula>", "eval")
    except SyntaxError as exc:  # pragma: no cover — already parsed
        raise ValueError(f"invalid formula: {exc}") from exc

    locals_dict = dict(variables)
    result = eval(code, _SAFE_GLOBALS, locals_dict)
    if not isinstance(result, np.ndarray):
        # Broadcast scalar results to a 0-d array for caller consistency
        result = np.asarray(result, dtype=float)
    return result
