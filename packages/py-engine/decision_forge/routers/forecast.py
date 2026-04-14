from __future__ import annotations
import json
import sqlite3
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from decision_forge.calibration import calibration_report

router = APIRouter(prefix="/forecast")
_conn: sqlite3.Connection | None = None


def set_connection(conn: sqlite3.Connection) -> None:
    global _conn
    _conn = conn


def _db() -> sqlite3.Connection:
    if _conn is None:
        raise HTTPException(500, "db not initialised")
    return _conn


class QuestionIn(BaseModel):
    id: str
    text: str
    createdAt: str
    resolveBy: str
    resolutionCriteria: Optional[str] = None
    scenarioId: Optional[str] = None
    tags: list[str] = Field(default_factory=list)


class PredictionIn(BaseModel):
    id: str
    questionId: str
    probability: float = Field(ge=0, le=1)
    madeAt: str
    rationale: Optional[str] = None
    confidence: Optional[str] = None


class AskIn(BaseModel):
    question: QuestionIn
    prediction: PredictionIn


class ResolveIn(BaseModel):
    questionId: str
    outcome: int = Field(ge=0, le=1)
    resolvedAt: str
    notes: Optional[str] = None


@router.post("/question")
def ask(body: AskIn) -> dict:
    if body.prediction.questionId != body.question.id:
        raise HTTPException(400, "prediction.questionId must match question.id")
    db = _db()
    db.execute(
        "INSERT INTO questions(id, text, created_at, resolve_by, resolution_criteria, scenario_id, tags) "
        "VALUES (?,?,?,?,?,?,?)",
        (body.question.id, body.question.text, body.question.createdAt,
         body.question.resolveBy, body.question.resolutionCriteria,
         body.question.scenarioId, json.dumps(body.question.tags)),
    )
    db.execute(
        "INSERT INTO predictions(id, question_id, probability, made_at, rationale, confidence) "
        "VALUES (?,?,?,?,?,?)",
        (body.prediction.id, body.prediction.questionId,
         float(body.prediction.probability), body.prediction.madeAt,
         body.prediction.rationale, body.prediction.confidence),
    )
    return {"ok": True}


@router.post("/predict")
def predict(body: PredictionIn) -> dict:
    db = _db()
    row = db.execute("SELECT 1 FROM questions WHERE id=?", (body.questionId,)).fetchone()
    if not row:
        raise HTTPException(404, "question not found")
    db.execute(
        "INSERT INTO predictions(id, question_id, probability, made_at, rationale, confidence) "
        "VALUES (?,?,?,?,?,?)",
        (body.id, body.questionId, float(body.probability), body.madeAt,
         body.rationale, body.confidence),
    )
    return {"ok": True}


@router.post("/resolve")
def resolve(body: ResolveIn) -> dict:
    db = _db()
    row = db.execute("SELECT 1 FROM questions WHERE id=?", (body.questionId,)).fetchone()
    if not row:
        raise HTTPException(404, "question not found")
    db.execute(
        "INSERT OR REPLACE INTO resolutions(question_id, outcome, resolved_at, notes) "
        "VALUES (?,?,?,?)",
        (body.questionId, body.outcome, body.resolvedAt, body.notes),
    )
    return {"ok": True}


@router.get("/questions")
def list_questions() -> list[dict]:
    db = _db()
    rows = db.execute("""
      SELECT q.id, q.text, q.created_at, q.resolve_by, q.resolution_criteria,
             q.scenario_id, q.tags,
             (SELECT probability FROM predictions p
                WHERE p.question_id = q.id
                ORDER BY p.made_at DESC LIMIT 1) AS latest_probability,
             (SELECT made_at FROM predictions p
                WHERE p.question_id = q.id
                ORDER BY p.made_at DESC LIMIT 1) AS latest_made_at,
             r.outcome AS outcome,
             r.resolved_at AS resolved_at
      FROM questions q
      LEFT JOIN resolutions r ON r.question_id = q.id
      ORDER BY q.created_at DESC
    """).fetchall()
    out = []
    for r in rows:
        out.append({
            "id": r["id"],
            "text": r["text"],
            "createdAt": r["created_at"],
            "resolveBy": r["resolve_by"],
            "resolutionCriteria": r["resolution_criteria"],
            "scenarioId": r["scenario_id"],
            "tags": json.loads(r["tags"] or "[]"),
            "latestProbability": r["latest_probability"],
            "latestMadeAt": r["latest_made_at"],
            "outcome": r["outcome"],
            "resolvedAt": r["resolved_at"],
            "resolved": r["outcome"] is not None,
        })
    return out


@router.get("/calibration")
def calibration() -> dict:
    db = _db()
    rows = db.execute("""
      SELECT (SELECT probability FROM predictions p
                WHERE p.question_id = q.id
                ORDER BY p.made_at DESC LIMIT 1) AS p,
             r.outcome AS o
      FROM questions q
      JOIN resolutions r ON r.question_id = q.id
    """).fetchall()
    pairs = [(float(r["p"]), int(r["o"])) for r in rows if r["p"] is not None]
    return calibration_report(pairs)
