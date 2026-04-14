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
    migrate(conn)
    conn.execute("SELECT 1").fetchone()


def test_probability_check_constraint(tmp_path):
    import sqlite3
    conn = open_db(str(tmp_path / "forecasts.db"))
    migrate(conn)
    conn.execute(
        "INSERT INTO questions(id, text, created_at, resolve_by) VALUES (?,?,?,?)",
        ("q1", "?", "2026-04-14T00:00:00Z", "2026-05-14T00:00:00Z"),
    )
    try:
        conn.execute(
            "INSERT INTO predictions(id, question_id, probability, made_at) "
            "VALUES (?,?,?,?)",
            ("p1", "q1", 1.5, "2026-04-14T00:00:00Z"),
        )
        raised = False
    except sqlite3.IntegrityError:
        raised = True
    assert raised
