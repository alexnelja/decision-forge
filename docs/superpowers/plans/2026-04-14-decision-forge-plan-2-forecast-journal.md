# Decision Forge — Plan 2: Forecast Journal

**Date:** 2026-04-14
**Prereqs:** Plan 1 merged (monorepo, Electron shell, Python sidecar, Scenario I/O).
**Design reference:** `docs/superpowers/specs/2026-04-13-decision-forge-design.md` §8.

## Goal

Turn the Forecast page from a placeholder into a working calibration journal:
ask a question, log a probability, resolve it later, see Brier score and
calibration trends. SQLite lives at `~/DecisionForge/forecasts.db`. All math
runs in the Python sidecar; the Electron main process proxies IPC to HTTP.

## Non-goals (deferred)

- Belief-update timeline animation (§8.4 "Update mode" — multiple predictions
  per question). Schema supports it; UI ships with one prediction per question.
- "Log forecast from P90" Monte Carlo hook (§6.5) — waits for Plan 3.
- Scenario linkage in UI — schema has `scenario_id`; UI ignores it in Plan 2.
- Tag-filtered breakdowns — filter bar ships, per-tag aggregation endpoint ships
  later. Plan 2 shows overall calibration + filter-by-tag on the list only.

## File structure added / modified

```
packages/core/src/schemas/
  forecast.ts                (rewritten — was placeholder)
packages/py-engine/decision_forge/
  db.py                      (new — sqlite connection + migration)
  calibration.py             (new — Brier, bucketing, reliability decomp)
  routers/forecast.py        (new — REST endpoints)
  app.py                     (modified — include forecast router)
packages/py-engine/tests/
  test_db.py                 (new)
  test_calibration.py        (new)
  test_forecast_routes.py    (new)
packages/desktop/src/main/
  forecast.ts                (new — IPC bridge to sidecar)
  index.ts                   (modified — registerForecastIpc)
  preload.ts                 (modified — expose forecast API)
packages/desktop/src/renderer/
  lib/forecast-api.ts        (new)
  pages/Forecast.tsx         (rewritten)
  pages/forecast/AskForm.tsx (new)
  pages/forecast/QuestionList.tsx (new)
  pages/forecast/ResolveDialog.tsx (new)
  pages/forecast/Calibration.tsx (new)
packages/desktop/tests/
  main/forecast.test.ts      (new)
  e2e/forecast.spec.ts       (new)
```

## Conventions

- TDD — write the failing test, confirm it fails for the expected reason,
  then implement. Tests live next to the module they exercise.
- No generic exception swallowing; propagate and let callers log.
- All timestamps: ISO-8601 UTC strings (`2026-04-14T10:00:00Z`).
- Probabilities: `number` in `[0, 1]`, never percent.
- Brier score: mean of `(p - outcome)^2`; lower is better; range `[0, 1]`.
- IDs: UUIDv4 strings generated in renderer (`crypto.randomUUID()`).
- Keep editorial design language from Plan 1 — Fraunces display, Plex Sans
  chrome, JetBrains Mono numerics, warm off-black palette, `--sec-forecast`
  accent (`#6fa88a` sage).

---

### Task 1: Core — Forecast Zod schemas

**Goal:** Replace the placeholder `forecast.ts` with real types shared by
renderer and IPC layer.

**Files:**
- Modify: `packages/core/src/schemas/forecast.ts`
- Modify: `packages/core/tests/forecast.test.ts` (create if absent)

- [ ] **Step 1: Write failing test `packages/core/tests/forecast.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import {
  QuestionSchema,
  PredictionSchema,
  ResolutionSchema,
  CalibrationReportSchema
} from "../src/schemas/forecast.js";

describe("forecast schemas", () => {
  it("accepts a minimal question", () => {
    expect(() =>
      QuestionSchema.parse({
        id: "11111111-1111-1111-1111-111111111111",
        text: "Will copper close > $9k on 2026-12-31?",
        createdAt: "2026-04-14T10:00:00Z",
        resolveBy: "2026-12-31T23:59:59Z",
        tags: ["mining"]
      })
    ).not.toThrow();
  });

  it("rejects probability outside [0,1]", () => {
    expect(() =>
      PredictionSchema.parse({
        id: "22222222-2222-2222-2222-222222222222",
        questionId: "11111111-1111-1111-1111-111111111111",
        probability: 1.2,
        madeAt: "2026-04-14T10:00:00Z"
      })
    ).toThrow();
  });

  it("accepts resolution with outcome 0 or 1", () => {
    expect(() =>
      ResolutionSchema.parse({
        questionId: "11111111-1111-1111-1111-111111111111",
        outcome: 1,
        resolvedAt: "2027-01-02T09:00:00Z"
      })
    ).not.toThrow();
  });

  it("accepts a calibration report shape", () => {
    const parsed = CalibrationReportSchema.parse({
      count: 10,
      brier: 0.18,
      buckets: [
        { predicted: 0.1, actual: 0.0, n: 1 },
        { predicted: 0.9, actual: 1.0, n: 2 }
      ]
    });
    expect(parsed.count).toBe(10);
  });
});
```

- [ ] **Step 2: Confirm FAIL**
`cd packages/core && pnpm test` → missing exports.

- [ ] **Step 3: Write `packages/core/src/schemas/forecast.ts`**

```ts
import { z } from "zod";

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
const uuid = z.string().uuid();
const prob = z.number().min(0).max(1);

export const QuestionSchema = z.object({
  id: uuid,
  text: z.string().min(1),
  createdAt: iso,
  resolveBy: iso,
  resolutionCriteria: z.string().optional(),
  scenarioId: uuid.optional(),
  tags: z.array(z.string()).default([])
});
export type Question = z.infer<typeof QuestionSchema>;

export const PredictionSchema = z.object({
  id: uuid,
  questionId: uuid,
  probability: prob,
  madeAt: iso,
  rationale: z.string().optional(),
  confidence: z.enum(["low", "medium", "high"]).optional()
});
export type Prediction = z.infer<typeof PredictionSchema>;

export const ResolutionSchema = z.object({
  questionId: uuid,
  outcome: z.union([z.literal(0), z.literal(1)]),
  resolvedAt: iso,
  notes: z.string().optional()
});
export type Resolution = z.infer<typeof ResolutionSchema>;

export const CalibrationBucketSchema = z.object({
  predicted: prob,    // bucket center
  actual: prob,       // empirical frequency
  n: z.number().int().nonnegative()
});
export type CalibrationBucket = z.infer<typeof CalibrationBucketSchema>;

export const CalibrationReportSchema = z.object({
  count: z.number().int().nonnegative(),
  brier: z.number().min(0).max(1),
  buckets: z.array(CalibrationBucketSchema)
});
export type CalibrationReport = z.infer<typeof CalibrationReportSchema>;
```

- [ ] **Step 4: PASS**
`pnpm test` → green.

- [ ] **Step 5: Commit**
`feat(core): Forecast Journal Zod schemas (Question, Prediction, Resolution, CalibrationReport)`

---

### Task 2: Python — SQLite database module

**Goal:** `decision_forge.db` opens/initialises `~/DecisionForge/forecasts.db`
with the three tables from §8.2, idempotently. Test uses `tmp_path`.

**Files:**
- Create: `packages/py-engine/decision_forge/db.py`
- Create: `packages/py-engine/tests/test_db.py`

- [ ] **Step 1: Failing test**

```python
# packages/py-engine/tests/test_db.py
import sqlite3
from decision_forge.db import open_db, migrate

def test_migrate_creates_tables(tmp_path):
    db_path = tmp_path / "forecasts.db"
    conn = open_db(str(db_path))
    migrate(conn)
    rows = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).fetchall()
    names = {r[0] for r in rows}
    assert {"questions", "predictions", "resolutions"}.issubset(names)

def test_migrate_is_idempotent(tmp_path):
    db_path = tmp_path / "forecasts.db"
    conn = open_db(str(db_path))
    migrate(conn)
    migrate(conn)  # second call should not raise
    conn.execute("SELECT 1").fetchone()
```

- [ ] **Step 2: Confirm FAIL**

```bash
cd packages/py-engine && source .venv/bin/activate && pytest tests/test_db.py
```

- [ ] **Step 3: Implement**

```python
# packages/py-engine/decision_forge/db.py
from __future__ import annotations
import sqlite3
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  resolve_by TEXT NOT NULL,
  resolution_criteria TEXT,
  scenario_id TEXT,
  tags TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS predictions (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  probability REAL NOT NULL CHECK (probability >= 0 AND probability <= 1),
  made_at TEXT NOT NULL,
  rationale TEXT,
  confidence TEXT CHECK (confidence IN ('low','medium','high') OR confidence IS NULL)
);
CREATE TABLE IF NOT EXISTS resolutions (
  question_id TEXT PRIMARY KEY REFERENCES questions(id) ON DELETE CASCADE,
  outcome INTEGER NOT NULL CHECK (outcome IN (0,1)),
  resolved_at TEXT NOT NULL,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_predictions_question ON predictions(question_id);
CREATE INDEX IF NOT EXISTS idx_questions_resolve_by ON questions(resolve_by);
"""

def open_db(path: str) -> sqlite3.Connection:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    # check_same_thread=False: FastAPI runs handlers in a threadpool; we serialise via SQLite's own locking + WAL
    conn = sqlite3.connect(path, isolation_level=None, check_same_thread=False)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.row_factory = sqlite3.Row
    return conn

def migrate(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)
```

- [ ] **Step 4: PASS**
`pytest tests/test_db.py`

- [ ] **Step 5: Commit**
`feat(py-engine): SQLite db module with questions/predictions/resolutions schema`

---

### Task 3: Python — Brier + calibration math

**Goal:** Pure functions, no DB. Input: list of `(predicted, outcome)` pairs
where `outcome ∈ {0,1}`. Output: Brier score and calibration buckets
(equal-width, default 10 bins).

**Files:**
- Create: `packages/py-engine/decision_forge/calibration.py`
- Create: `packages/py-engine/tests/test_calibration.py`

- [ ] **Step 1: Failing test**

```python
# packages/py-engine/tests/test_calibration.py
import math
import pytest
from decision_forge.calibration import brier_score, calibration_report

def test_brier_perfect():
    # always 1.0 when outcome=1, always 0.0 when outcome=0
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
    # five predictions at p=0.1, all wrong; five at p=0.9, all right
    pairs = [(0.1, 0)] * 5 + [(0.9, 1)] * 5
    r = calibration_report(pairs, n_bins=10)
    assert r["count"] == 10
    # bucket centered near 0.1: actual=0.0; bucket near 0.9: actual=1.0
    low = next(b for b in r["buckets"] if 0.05 < b["predicted"] < 0.15)
    high = next(b for b in r["buckets"] if 0.85 < b["predicted"] < 0.95)
    assert low["actual"] == 0.0 and low["n"] == 5
    assert high["actual"] == 1.0 and high["n"] == 5
    assert math.isclose(r["brier"], 0.01, abs_tol=1e-9)
```

- [ ] **Step 2: Confirm FAIL**
`pytest tests/test_calibration.py`

- [ ] **Step 3: Implement**

```python
# packages/py-engine/decision_forge/calibration.py
from __future__ import annotations
from typing import Iterable

Pair = tuple[float, int]

def brier_score(pairs: list[Pair]) -> float:
    if not pairs:
        raise ValueError("brier_score requires at least one pair")
    return sum((p - o) ** 2 for p, o in pairs) / len(pairs)

def calibration_report(pairs: list[Pair], n_bins: int = 10) -> dict:
    if not pairs:
        return {"count": 0, "brier": 0.0, "buckets": []}

    width = 1.0 / n_bins
    # accumulate sums per bin
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
            "n": bin_n[i]
        })

    return {
        "count": len(pairs),
        "brier": brier_score(pairs),
        "buckets": buckets
    }
```

- [ ] **Step 4: PASS**
`pytest tests/test_calibration.py`

- [ ] **Step 5: Commit**
`feat(py-engine): Brier score and calibration bucket math`

---

### Task 4: Python — /forecast REST endpoints

**Goal:** FastAPI router with:
- `POST /forecast/question` — create question + initial prediction in one call.
- `POST /forecast/predict` — add a prediction to an existing question.
- `POST /forecast/resolve` — mark outcome.
- `GET /forecast/questions` — list (open + resolved), newest first.
- `GET /forecast/calibration` — overall Brier + buckets across resolved
  questions (using each question's *latest* prediction).

DB path from settings; test overrides with dependency injection.

**Files:**
- Create: `packages/py-engine/decision_forge/routers/forecast.py`
- Modify: `packages/py-engine/decision_forge/app.py`
- Modify: `packages/py-engine/decision_forge/config.py` (db_path)
- Create: `packages/py-engine/tests/test_forecast_routes.py`

- [ ] **Step 1: Failing test**

```python
# packages/py-engine/tests/test_forecast_routes.py
import uuid
from fastapi.testclient import TestClient
from decision_forge.app import create_app
from decision_forge.db import open_db, migrate
from decision_forge.routers import forecast as forecast_router

def _client(tmp_path):
    conn = open_db(str(tmp_path / "forecasts.db"))
    migrate(conn)
    forecast_router.set_connection(conn)
    app = create_app()
    return TestClient(app)

def _uuid():
    return str(uuid.uuid4())

def test_ask_list_predict_resolve_roundtrip(tmp_path):
    c = _client(tmp_path)
    qid, pid = _uuid(), _uuid()

    r = c.post("/forecast/question", json={
        "question": {
            "id": qid, "text": "Will it rain?", "createdAt": "2026-04-14T10:00:00Z",
            "resolveBy": "2026-04-20T10:00:00Z", "tags": ["weather"]
        },
        "prediction": {
            "id": pid, "questionId": qid, "probability": 0.3,
            "madeAt": "2026-04-14T10:00:00Z"
        }
    })
    assert r.status_code == 200, r.text

    r = c.get("/forecast/questions")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["id"] == qid
    assert body[0]["latestProbability"] == 0.3
    assert body[0]["resolved"] is False

    r = c.post("/forecast/resolve", json={
        "questionId": qid, "outcome": 0, "resolvedAt": "2026-04-21T10:00:00Z"
    })
    assert r.status_code == 200

    r = c.get("/forecast/calibration")
    assert r.status_code == 200
    cal = r.json()
    assert cal["count"] == 1
    # p=0.3, outcome=0 → brier = 0.09
    assert abs(cal["brier"] - 0.09) < 1e-9

def test_predict_requires_existing_question(tmp_path):
    c = _client(tmp_path)
    r = c.post("/forecast/predict", json={
        "id": _uuid(), "questionId": _uuid(),
        "probability": 0.5, "madeAt": "2026-04-14T10:00:00Z"
    })
    assert r.status_code == 404
```

- [ ] **Step 2: Confirm FAIL**
`pytest tests/test_forecast_routes.py`

- [ ] **Step 3: Implement router**

```python
# packages/py-engine/decision_forge/routers/forecast.py
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
         body.question.scenarioId, json.dumps(body.question.tags))
    )
    db.execute(
        "INSERT INTO predictions(id, question_id, probability, made_at, rationale, confidence) "
        "VALUES (?,?,?,?,?,?)",
        (body.prediction.id, body.prediction.questionId,
         float(body.prediction.probability), body.prediction.madeAt,
         body.prediction.rationale, body.prediction.confidence)
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
         body.rationale, body.confidence)
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
        (body.questionId, body.outcome, body.resolvedAt, body.notes)
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
            "resolved": r["outcome"] is not None
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
```

- [ ] **Step 4: Wire router in `app.py`**

```python
# packages/py-engine/decision_forge/app.py
from fastapi import FastAPI
from decision_forge.routers import health, forecast
from decision_forge.db import open_db, migrate
from decision_forge.config import settings

def create_app() -> FastAPI:
    app = FastAPI(title="Decision Forge Engine", version="0.1.0")
    app.include_router(health.router)
    app.include_router(forecast.router)
    # init db + inject connection unless test already did so
    if forecast._conn is None:
        conn = open_db(settings.db_path)
        migrate(conn)
        forecast.set_connection(conn)
    return app
```

- [ ] **Step 5: Add `db_path` to settings**

```python
# packages/py-engine/decision_forge/config.py
import os
from pathlib import Path
from pydantic_settings import BaseSettings

def _default_db() -> str:
    return str(Path(os.path.expanduser("~")) / "DecisionForge" / "forecasts.db")

class Settings(BaseSettings):
    port: int = 8765
    anthropic_api_key: str | None = None
    db_path: str = _default_db()

    class Config:
        env_prefix = "DECISION_FORGE_"

settings = Settings()
```

- [ ] **Step 6: PASS**
`pytest`

- [ ] **Step 7: Commit**
`feat(py-engine): /forecast REST endpoints with SQLite-backed persistence`

---

### Task 5: Desktop main — forecast IPC bridge

**Goal:** Main-process module that proxies IPC calls to the sidecar's
`/forecast/*` endpoints. Renderer never talks to the sidecar directly for
forecast data — the main process owns the HTTP client so we can swap hosts
/ add auth without touching UI.

**Files:**
- Create: `packages/desktop/src/main/forecast.ts`
- Modify: `packages/desktop/src/main/index.ts`
- Modify: `packages/desktop/src/main/preload.ts`
- Create: `packages/desktop/tests/main/forecast.test.ts`

- [ ] **Step 1: Failing test**

```ts
// packages/desktop/tests/main/forecast.test.ts
import { describe, it, expect, vi } from "vitest";
import { ForecastClient } from "../../src/main/forecast.js";

describe("ForecastClient", () => {
  it("posts ask with correct body and url", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    const client = new ForecastClient("http://127.0.0.1:8765", fetchMock as unknown as typeof fetch);
    await client.ask({ question: { id: "q" } as any, prediction: { id: "p" } as any });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8765/forecast/question",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("throws on non-ok status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("nope", { status: 404 }));
    const client = new ForecastClient("http://127.0.0.1:8765", fetchMock as unknown as typeof fetch);
    await expect(client.list()).rejects.toThrow(/forecast.*404/i);
  });
});
```

- [ ] **Step 2: FAIL**
`cd packages/desktop && pnpm test`

- [ ] **Step 3: Implement**

```ts
// packages/desktop/src/main/forecast.ts
import { ipcMain } from "electron";
import type {
  Question, Prediction, Resolution, CalibrationReport
} from "@decision-forge/core";

export class ForecastClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    const r = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) }
    });
    if (!r.ok) {
      const body = await r.text();
      throw new Error(`forecast ${path} ${r.status}: ${body.slice(0, 200)}`);
    }
    return r.json() as Promise<T>;
  }

  ask(body: { question: Question; prediction: Prediction }) {
    return this.req<{ ok: true }>("/forecast/question", {
      method: "POST", body: JSON.stringify(body)
    });
  }
  predict(p: Prediction) {
    return this.req<{ ok: true }>("/forecast/predict", {
      method: "POST", body: JSON.stringify(p)
    });
  }
  resolve(r: Resolution) {
    return this.req<{ ok: true }>("/forecast/resolve", {
      method: "POST", body: JSON.stringify(r)
    });
  }
  list() {
    return this.req<Array<Record<string, unknown>>>("/forecast/questions");
  }
  calibration() {
    return this.req<CalibrationReport>("/forecast/calibration");
  }
}

let client: ForecastClient | null = null;

export function registerForecastIpc(baseUrl: string): void {
  client = new ForecastClient(baseUrl);
  ipcMain.handle("forecast:ask", (_e, body) => client!.ask(body));
  ipcMain.handle("forecast:predict", (_e, p) => client!.predict(p));
  ipcMain.handle("forecast:resolve", (_e, r) => client!.resolve(r));
  ipcMain.handle("forecast:list", () => client!.list());
  ipcMain.handle("forecast:calibration", () => client!.calibration());
}
```

- [ ] **Step 4: Wire in `index.ts`**

In `app.whenReady()`, after `registerScenarioIpc()`:

```ts
import { registerForecastIpc } from "./forecast.js";
// ...
registerForecastIpc(sidecar.baseUrl);
```

- [ ] **Step 5: Expose in preload**

Append to `preload.ts`:

```ts
const forecast = {
  ask: (body: unknown) => ipcRenderer.invoke("forecast:ask", body),
  predict: (p: unknown) => ipcRenderer.invoke("forecast:predict", p),
  resolve: (r: unknown) => ipcRenderer.invoke("forecast:resolve", r),
  list: () => ipcRenderer.invoke("forecast:list"),
  calibration: () => ipcRenderer.invoke("forecast:calibration")
};

// replace the existing contextBridge.exposeInMainWorld call:
contextBridge.exposeInMainWorld("api", {
  sidecarUrl: () => (process.env.SIDECAR_URL ?? "http://127.0.0.1:8765"),
  scenarios,
  forecast
});
```

- [ ] **Step 6: PASS**
`pnpm test`

- [ ] **Step 7: Commit**
`feat(desktop): forecast IPC bridge to sidecar`

---

### Task 6: Renderer — Question list + Resolve dialog

**Goal:** Real table of questions, sorted newest first. Resolved rows show
outcome and Brier contribution. Unresolved rows show a "Resolve" button that
opens a tiny dialog (outcome: happened / didn't, optional notes), posts
`forecast:resolve`, refreshes.

**Files:**
- Create: `packages/desktop/src/renderer/pages/forecast/QuestionList.tsx`
- Create: `packages/desktop/src/renderer/pages/forecast/ResolveDialog.tsx`
- Modify: `packages/desktop/src/renderer/pages/Forecast.tsx`

Spec details (write the test in `tests/renderer/QuestionList.test.tsx` against
a mocked `forecastApi.list` returning two rows — one resolved, one open —
asserting both render and the open row exposes a Resolve button):

```tsx
// minimal test shape
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
// mock window.api.forecast ...
```

Rendering rules:
- Table columns: №, Claim, p, Resolves, Brier, Action.
- p shown as percent, mono.
- Brier for resolved = `(p - outcome)^2` to 3 dp, color-coded:
  `< 0.05` sage, `< 0.2` bone, else vermilion.
- "Resolve" button only on unresolved rows; date shown in `—`.
- ResolveDialog: two large pill buttons ("It happened" / "It didn't"), a
  notes field, commit button. Section accent for the affirmative.

- [ ] Commit: `feat(desktop): Forecast question list + resolve dialog`

---

### Task 7: Renderer — Ask mode + forecast API client

**Goal:** In the Forecast page, a compact "Ask" form: question text, tags,
resolve-by date, initial probability (slider 0–100), optional rationale.
Submit posts through `window.api.forecast.ask` and refreshes the question
list. No separate multi-step flow — the form lives inline at the top of the
page.

**Files:**
- Create: `packages/desktop/src/renderer/lib/forecast-api.ts`
- Create: `packages/desktop/src/renderer/pages/forecast/AskForm.tsx`
- Modify: `packages/desktop/src/renderer/pages/Forecast.tsx`

- [ ] **Step 1: Write `forecast-api.ts`**

```ts
// packages/desktop/src/renderer/lib/forecast-api.ts
import type {
  Question, Prediction, Resolution, CalibrationReport
} from "@decision-forge/core";

type QuestionRow = Question & {
  latestProbability: number | null;
  latestMadeAt: string | null;
  outcome: 0 | 1 | null;
  resolvedAt: string | null;
  resolved: boolean;
};

export const forecastApi = {
  ask: (q: Question, p: Prediction) =>
    window.api.forecast.ask({ question: q, prediction: p }),
  predict: (p: Prediction) => window.api.forecast.predict(p),
  resolve: (r: Resolution) => window.api.forecast.resolve(r),
  list: () => window.api.forecast.list() as Promise<QuestionRow[]>,
  calibration: () => window.api.forecast.calibration() as Promise<CalibrationReport>
};

export type { QuestionRow };
```

Also update the `Window.api` interface in `sidecar-client.ts` to include
`forecast`.

- [ ] **Step 2: AskForm component**

```tsx
// packages/desktop/src/renderer/pages/forecast/AskForm.tsx
import { useState } from "react";
import { forecastApi } from "../../lib/forecast-api";

function iso(d: Date) { return d.toISOString().replace(/\.\d+Z$/, "Z"); }

export function AskForm({ onAsked }: { onAsked: () => void }) {
  const [text, setText] = useState("");
  const [tags, setTags] = useState("");
  const [resolveBy, setResolveBy] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() + 3);
    return d.toISOString().slice(0, 10);
  });
  const [prob, setProb] = useState(50);
  const [rationale, setRationale] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const qid = crypto.randomUUID();
      const now = iso(new Date());
      await forecastApi.ask(
        {
          id: qid,
          text: text.trim(),
          createdAt: now,
          resolveBy: `${resolveBy}T23:59:59Z`,
          tags: tags.split(",").map(t => t.trim()).filter(Boolean)
        },
        {
          id: crypto.randomUUID(),
          questionId: qid,
          probability: prob / 100,
          madeAt: now,
          rationale: rationale.trim() || undefined
        }
      );
      setText(""); setTags(""); setRationale(""); setProb(50);
      onAsked();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="border-t border-b border-paper-rule py-6 mb-10 grid grid-cols-[1fr_240px] gap-6"
    >
      <div className="space-y-3">
        <div>
          <label className="eyebrow block mb-2" style={{ color: "var(--sec-forecast)" }}>
            The claim
          </label>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Will …?"
            className="w-full bg-transparent border-b border-paper-rule focus:border-section-forecast outline-none font-display text-[22px] text-ink py-2"
            style={{ fontVariationSettings: '"opsz" 32, "wght" 380' }}
          />
        </div>
        <div className="flex gap-6">
          <div className="flex-1">
            <label className="eyebrow block mb-1">Tags</label>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="mining, fx"
              className="w-full bg-transparent border-b border-paper-rule outline-none font-mono text-[12px] text-ink py-1"
            />
          </div>
          <div>
            <label className="eyebrow block mb-1">Resolves by</label>
            <input
              type="date"
              value={resolveBy}
              onChange={(e) => setResolveBy(e.target.value)}
              className="bg-transparent border-b border-paper-rule outline-none font-mono text-[12px] text-ink py-1"
            />
          </div>
        </div>
        <div>
          <label className="eyebrow block mb-1">Rationale (optional)</label>
          <textarea
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            rows={2}
            className="w-full bg-transparent border-b border-paper-rule outline-none font-display text-[14px] text-ink-dim py-1"
          />
        </div>
      </div>

      <div>
        <label className="eyebrow block mb-2">Probability</label>
        <div
          className="font-display text-[64px] leading-none tabular-nums"
          style={{ color: "var(--sec-forecast)", fontVariationSettings: '"opsz" 144, "wght" 300' }}
        >
          {prob}<span className="text-[28px] text-ink-dim">%</span>
        </div>
        <input
          type="range" min={0} max={100} step={1}
          value={prob} onChange={(e) => setProb(Number(e.target.value))}
          className="w-full mt-3 accent-section-forecast"
        />
        <button
          type="submit" disabled={busy || !text.trim()}
          className="mt-4 w-full py-2 border border-section-forecast text-section-forecast eyebrow hover:bg-section-forecast/10 disabled:opacity-40"
        >
          {busy ? "Committing…" : "Commit prediction"}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Rewire `Forecast.tsx`**

Use state + `forecastApi.list()` to render real rows (replacing the
placeholder table) and mount `<AskForm onAsked={refresh} />` above the
existing `<QuestionList />` from Task 6. Calibration block arrives in
Task 8.

Keep the editorial frame (`ModuleFrame`) and marginalia.

- [ ] **Step 4: Commit**
`feat(desktop): Forecast ask mode — inline form, slider, commit`

---

### Task 8: Renderer — Calibration panel

**Goal:** A compact calibration readout at the top of the page
(under the Ask form), updated whenever the list refreshes. Shows:
- big Brier number (sage if `<0.2`, bone otherwise), count of resolved
  questions,
- tiny SVG calibration plot (20 × 10 buckets on a diagonal reference line).

Pure React + inline SVG; no chart library needed.

**Files:**
- Create: `packages/desktop/src/renderer/pages/forecast/Calibration.tsx`
- Modify: `packages/desktop/src/renderer/pages/Forecast.tsx`

Test in `tests/renderer/Calibration.test.tsx`: renders "No resolved
questions yet" when `count === 0`; renders Brier numeral otherwise.

- [ ] Commit: `feat(desktop): Forecast calibration panel with inline SVG plot`

---

### Task 9: Renderer — Seed sample data button

**Goal:** A subtle "Seed 10 sample predictions" button in the marginalia,
visible only when the journal is empty. Pressing it posts 10 pre-written
questions with mixed outcomes via `forecastApi.ask` + `forecastApi.resolve`
so the calibration panel is immediately meaningful for demo / first-run use.

**Files:**
- Modify: `packages/desktop/src/renderer/pages/Forecast.tsx`
- Create: `packages/desktop/src/renderer/pages/forecast/seedSamples.ts`

The seed set mixes well-calibrated and poorly-calibrated predictions so the
Brier + reliability plot have visible signal. Button is hidden once the
question list is non-empty.

- [ ] Commit: `feat(desktop): one-click seed of 10 sample predictions for calibration demo`

---

### Task 10: E2E — ask → resolve → calibration

**Goal:** Playwright spec that:
1. Launches Electron with `HOME` → tmp dir (so both scenarios and
   forecasts live in a throwaway location; sidecar config reads `db_path`).
2. Navigates to Forecast.
3. Asks a question at p=0.8.
4. Resolves it as outcome=1.
5. Asserts calibration panel now shows `brier = 0.04` (±rounding) and
   `count = 1`.

The sidecar picks up `DECISION_FORGE_DB_PATH` from the environment; the test
sets that env var to point at the tmp dir.

**Files:**
- Create: `packages/desktop/tests/e2e/forecast.spec.ts`

- [ ] Commit: `test(desktop): e2e ask→resolve→calibration roundtrip`

---

## Definition of Done

- [ ] `pnpm -r build && pnpm test` green across workspace.
- [ ] `cd packages/py-engine && pytest` green (db, calibration, routes).
- [ ] `cd packages/desktop && pnpm test:e2e` green (smoke, scenarios, forecast).
- [ ] Running `pnpm dev` and visiting `§ III — Forecast`:
  - [ ] Ask form commits a prediction; question appears in the list.
  - [ ] Resolve button sets outcome; row flips to resolved state.
  - [ ] Calibration panel updates with Brier and count.
  - [ ] "Seed 10 sample predictions" button appears on empty journal and
        populates a meaningful calibration view in one click.
- [ ] All 10 tasks' commits land on the branch in order.
- [ ] `~/DecisionForge/forecasts.db` is created on first run and survives
      app restart with data intact.
- [ ] No regressions in Plan 1 e2e specs.

## Open questions (ok to defer)

- Should a question's *latest* prediction define Brier, or the prediction
  nearest to the resolve date? Plan 2 uses latest; revisit when multiple
  predictions per question are exposed in UI.
- Tag-based calibration filter: shipped schema-side (tags stored) but not
  exposed in the calibration endpoint. Plan 2.5 or Plan 3.
