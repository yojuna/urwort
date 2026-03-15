"""
api/main.py — urwort FastAPI server

Endpoints:
  GET /api/health                           — health check
  GET /api/sync?since=0&limit=500           — paginated entry sync
  GET /api/sync/forms?since=0&limit=2000    — paginated forms sync
  POST /api/enrich/{entry_id}               — trigger DWDS enrichment
  GET /api/entry/{entry_id}                 — single entry lookup
  GET /api/search?q=...                     — server-side prefix search (fallback)
"""

import json
import logging
import os
import sqlite3
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .db import get_conn, get_meta, row_to_dict
from .enrichment import enrich_entry

# ── Logging ───────────────────────────────────────────────────────────────────

LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()
logging.basicConfig(level=getattr(logging, LOG_LEVEL, logging.INFO))
logger = logging.getLogger("urwort")

# ── App ───────────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Verify DB is reachable on startup
    try:
        conn = get_conn()
        count = conn.execute("SELECT COUNT(*) FROM entries").fetchone()[0]
        build_ts = get_meta("build_ts") or "unknown"
        logger.info("urwort DB ready: %d entries (built: %s)", count, build_ts)
    except RuntimeError as e:
        logger.error(str(e))
    yield


app = FastAPI(
    title="urwort API",
    version="2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    try:
        conn = get_conn()
        count = conn.execute("SELECT COUNT(*) FROM entries").fetchone()[0]
        forms_count = conn.execute("SELECT COUNT(*) FROM forms").fetchone()[0]
        build_ts = get_meta("build_ts")
        return {
            "status": "ok",
            "entries": count,
            "forms": forms_count,
            "build_ts": build_ts,
        }
    except Exception as e:
        return JSONResponse(status_code=503, content={"status": "error", "detail": str(e)})


# ── Sync ──────────────────────────────────────────────────────────────────────

@app.get("/api/sync")
def sync_entries(
    since: int = Query(0, description="Unix ms cursor; only return entries updated after this"),
    limit: int = Query(500, ge=1, le=2000, description="Page size"),
):
    """
    Paginated entry sync. Client calls repeatedly with next_cursor until has_more=false.

    Response:
      entries      — array of entry objects
      next_cursor  — pass as ?since= in next request
      has_more     — whether more pages exist
    """
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM entries WHERE updated_at > ? ORDER BY updated_at ASC LIMIT ?",
        (since, limit),
    ).fetchall()

    entries = [row_to_dict(r) for r in rows]
    next_cursor = entries[-1]["updated_at"] if entries else since

    return {
        "entries": entries,
        "next_cursor": next_cursor,
        "has_more": len(entries) == limit,
        "count": len(entries),
    }


@app.get("/api/sync/forms")
def sync_forms(
    entry_ids: str = Query("", description="Comma-separated entry IDs to fetch forms for"),
    since: int = Query(0, description="Unused for now, reserved for future incremental forms sync"),
    limit: int = Query(2000, ge=1, le=10000),
):
    """
    Fetch forms for a list of entry IDs.
    Client sends entry IDs from a sync batch to get their inflected forms.
    """
    conn = get_conn()

    if entry_ids:
        ids = [i.strip() for i in entry_ids.split(",") if i.strip()]
        if not ids:
            return {"forms": [], "count": 0}
        placeholders = ",".join("?" * len(ids))
        rows = conn.execute(
            f"SELECT form, entry_id, tags, source FROM forms WHERE entry_id IN ({placeholders}) LIMIT ?",
            ids + [limit],
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT form, entry_id, tags, source FROM forms LIMIT ?",
            (limit,),
        ).fetchall()

    forms = []
    for r in rows:
        f = dict(r)
        if f.get("tags") and isinstance(f["tags"], str):
            try:
                f["tags"] = json.loads(f["tags"])
            except Exception:
                f["tags"] = []
        forms.append(f)

    return {"forms": forms, "count": len(forms)}


# ── Single entry ──────────────────────────────────────────────────────────────

@app.get("/api/entry/{entry_id:path}")
def get_entry(entry_id: str):
    """Fetch a single entry by ID (e.g. 'Haus|NOUN')."""
    conn = get_conn()
    row = conn.execute("SELECT * FROM entries WHERE id = ?", (entry_id,)).fetchone()
    if row is None:
        # Try by lemma (return all POS variants)
        rows = conn.execute(
            "SELECT * FROM entries WHERE lemma = ?", (entry_id,)
        ).fetchall()
        if not rows:
            raise HTTPException(status_code=404, detail=f"Entry not found: {entry_id}")
        return {"entries": [row_to_dict(r) for r in rows]}
    return row_to_dict(row)


# ── Server-side search (fallback for client that hasn't synced yet) ───────────

@app.get("/api/search")
def search(
    q: str = Query(..., min_length=1, max_length=100),
    limit: int = Query(20, ge=1, le=100),
    pos: str = Query("", description="Filter by UPOS (e.g. NOUN, VERB)"),
):
    """
    Prefix search against lemma. Returns slim result rows.
    Primarily a fallback — the client should use local IndexedDB search.
    """
    conn = get_conn()
    q_clean = q.strip()
    q_prefix = q_clean + "%"

    params: list = [q_prefix, limit]
    pos_filter = ""
    if pos:
        pos_filter = " AND pos = ?"
        params = [q_prefix] + [pos] + [limit]

    rows = conn.execute(
        f"""
        SELECT id, lemma, pos, gender, cefr_level,
               json_extract(translations, '$[0]') as hint
        FROM entries
        WHERE lemma LIKE ?{pos_filter}
        ORDER BY
            CASE WHEN lemma = ? THEN 0 ELSE 1 END,  -- exact match first
            frequency_class ASC NULLS LAST,
            lemma ASC
        LIMIT ?
        """,
        [q_prefix] + ([pos] if pos else []) + [q_clean, limit],
    ).fetchall()

    results = []
    for r in rows:
        results.append({
            "id": r["id"],
            "lemma": r["lemma"],
            "pos": r["pos"],
            "gender": r["gender"],
            "cefr_level": r["cefr_level"],
            "hint": r["hint"],
        })

    # Also check forms table for inflected-form matches
    form_rows = conn.execute(
        """
        SELECT f.form, f.entry_id, f.tags,
               e.lemma, e.pos, e.gender, e.cefr_level,
               json_extract(e.translations, '$[0]') as hint
        FROM forms f
        JOIN entries e ON e.id = f.entry_id
        WHERE f.form LIKE ? AND f.form != e.lemma
        LIMIT ?
        """,
        [q_prefix, limit],
    ).fetchall()

    seen_ids = {r["id"] for r in results}
    for r in form_rows:
        if r["entry_id"] not in seen_ids:
            results.append({
                "id": r["entry_id"],
                "lemma": r["lemma"],
                "pos": r["pos"],
                "gender": r["gender"],
                "cefr_level": r["cefr_level"],
                "hint": r["hint"],
                "matched_form": r["form"],
            })
            seen_ids.add(r["entry_id"])

    return {"query": q_clean, "results": results, "count": len(results)}


# ── Enrichment ────────────────────────────────────────────────────────────────

@app.post("/api/enrich/{entry_id:path}")
async def trigger_enrich(entry_id: str):
    """
    Trigger DWDS enrichment for an entry.
    Fetches DWDS snippet, corpus, frequency, and word profile.
    Returns the updated entry.
    """
    result = await enrich_entry(entry_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Entry not found: {entry_id}")
    return result
