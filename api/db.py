"""
api/db.py — SQLite connection + helpers for urwort API.

One shared connection per process (WAL mode supports concurrent reads).
"""

import json
import os
import sqlite3
import threading
from typing import Any

_lock = threading.Lock()
_conn: sqlite3.Connection | None = None

DB_PATH = os.environ.get("DB_PATH", os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data", "urwort.db"
))


def get_conn() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        with _lock:
            if _conn is None:
                _conn = _open()
    return _conn


def _open() -> sqlite3.Connection:
    if not os.path.exists(DB_PATH):
        raise RuntimeError(
            f"Database not found: {DB_PATH}\n"
            "Run:  docker compose run --rm urwort-build"
        )
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous  = NORMAL")
    conn.execute("PRAGMA cache_size   = -32000")   # 32 MB
    conn.execute("PRAGMA temp_store   = MEMORY")
    return conn


def get_write_conn() -> sqlite3.Connection:
    """Separate connection for writes (enrichment). WAL allows concurrent read+write."""
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous  = NORMAL")
    conn.execute("PRAGMA cache_size   = -32000")
    return conn


def row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    """Convert a Row to a plain dict, parsing JSON columns."""
    d = dict(row)
    JSON_COLS = {
        "translations", "definitions_de", "senses", "examples", "inflections",
        "synonyms", "antonyms", "hypernyms", "hyponyms", "derived", "related",
        "collocations", "corpus_examples", "homophones", "proverbs",
        "usage_labels", "subject_domains", "frequency_ts", "sources",
    }
    for col in JSON_COLS:
        if col in d and isinstance(d[col], str):
            try:
                d[col] = json.loads(d[col])
            except (json.JSONDecodeError, TypeError):
                d[col] = [] if col != "sources" else {}
    return d


def get_entry(entry_id: str) -> dict | None:
    conn = get_conn()
    row = conn.execute(
        "SELECT * FROM entries WHERE id = ?", (entry_id,)
    ).fetchone()
    return row_to_dict(row) if row else None


def get_entry_by_lemma(lemma: str) -> list[dict]:
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM entries WHERE lemma = ?", (lemma,)
    ).fetchall()
    return [row_to_dict(r) for r in rows]


def get_meta(key: str) -> str | None:
    try:
        conn = get_conn()
        row = conn.execute("SELECT value FROM meta WHERE key = ?", (key,)).fetchone()
        return row[0] if row else None
    except Exception:
        return None
