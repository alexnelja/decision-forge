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
