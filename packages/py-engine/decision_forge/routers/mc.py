"""Monte Carlo simulation REST endpoints."""
from __future__ import annotations

from typing import Any, Optional

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from decision_forge.mc.evaluate import evaluate_formula
from decision_forge.mc.sampling import sample
from decision_forge.mc.stats import summarise


router = APIRouter(prefix="/mc")


class VariableIn(BaseModel):
    name: str
    distribution: dict[str, Any]


class MCConfigIn(BaseModel):
    variables: list[VariableIn] = Field(min_length=1)
    formula: str = Field(min_length=1)
    iterations: int = Field(default=10_000, ge=100, le=1_000_000)
    seed: Optional[int] = None


_WIRE_CAP = 1000


@router.post("/run")
def run(cfg: MCConfigIn) -> dict:
    rng = np.random.default_rng(cfg.seed) if cfg.seed is not None else np.random.default_rng()
    variables: dict[str, np.ndarray] = {}
    for var in cfg.variables:
        try:
            variables[var.name] = sample(rng, cfg.iterations, var.distribution)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        outcome = evaluate_formula(cfg.formula, variables)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"formula error: {exc}") from exc
    except NameError as exc:
        raise HTTPException(status_code=400, detail=f"formula references unknown name: {exc}") from exc

    if outcome.ndim == 0:
        # scalar result — broadcast to full iterations
        outcome = np.full(cfg.iterations, float(outcome))

    if not np.all(np.isfinite(outcome)):
        raise HTTPException(status_code=400, detail="formula produced non-finite values")

    stats = summarise(outcome)

    # Stride-sample down to the wire cap for a clean-looking histogram
    if outcome.size > _WIRE_CAP:
        stride = max(1, outcome.size // _WIRE_CAP)
        wire_samples = outcome[::stride][:_WIRE_CAP].tolist()
    else:
        wire_samples = outcome.tolist()

    return {
        "samples": wire_samples,
        "stats": stats,
        "iterations": cfg.iterations,
    }
