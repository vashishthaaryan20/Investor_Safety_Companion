"""Persist reports for review, never automatically treat them as truth."""

import json
import os
import sqlite3
from pathlib import Path
from uuid import uuid4


def record_feedback(analysis_id, kind, note="", evidence_text="", db_path=None):
    path = Path(
        db_path
        or os.getenv(
            "FEEDBACK_DB", str(Path(__file__).parent / ".cache" / "feedback.sqlite3")
        )
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    report_id = str(uuid4())
    with sqlite3.connect(path) as db:
        db.execute("""CREATE TABLE IF NOT EXISTS feedback (
            id TEXT PRIMARY KEY, analysis_id TEXT NOT NULL, kind TEXT NOT NULL,
            payload TEXT NOT NULL, review_status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)""")
        db.execute(
            "INSERT INTO feedback (id, analysis_id, kind, payload) VALUES (?, ?, ?, ?)",
            (
                report_id,
                analysis_id,
                kind,
                json.dumps({"note": note, "text": evidence_text}),
            ),
        )
    return {"report_id": report_id, "review_status": "pending"}
