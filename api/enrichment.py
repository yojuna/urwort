"""
api/enrichment.py — Fetch DWDS data and merge it into an entry.

Called by POST /api/enrich/{entry_id}.
Each enrichment step is independent — a failure in one doesn't block others.
"""

import json
import logging
import re
import sqlite3
import time
from typing import Any

import httpx

from .db import get_write_conn, row_to_dict

logger = logging.getLogger(__name__)

DWDS_SNIPPET_URL  = "https://www.dwds.de/api/wb/snippet/?q={word}"
DWDS_CORPUS_URL   = "https://www.dwds.de/r/?q={word}&view=json&corpus=kern&limit=10&format=json"
DWDS_FREQ_URL     = "https://www.dwds.de/api/stat/?q={word}"
DWDS_PROFILE_URL  = "https://www.dwds.de/api/wp/?q={word}&format=json"

# DWDS POS → UPOS
DWDS_WORTART_MAP = {
    "Substantiv": "NOUN",
    "Verb": "VERB",
    "Adjektiv": "ADJ",
    "Adverb": "ADV",
    "Präposition": "ADP",
    "Konjunktion": "CONJ",
    "Artikel": "DET",
    "Pronomen": "PRON",
    "Numerale": "NUM",
    "Interjektion": "INTJ",
    "Partikel": "PART",
}

DWDS_GENUS_MAP = {
    "Maskulinum": "m",
    "Femininum": "f",
    "Neutrum": "n",
}


def _extract_dwds_snippet(data: list) -> dict:
    """Pull fields from DWDS snippet response."""
    if not data:
        return {}
    item = data[0]
    result: dict[str, Any] = {}

    lemma = item.get("lemma") or item.get("input")
    if lemma:
        result["lemma_dwds"] = lemma

    wortart = item.get("wortart", "")
    if wortart:
        # wortart may be "Substantiv, Neutrum"
        parts = [p.strip() for p in wortart.split(",")]
        pos_word = parts[0] if parts else ""
        pos_upos = DWDS_WORTART_MAP.get(pos_word)
        if pos_upos:
            result["pos_dwds"] = pos_upos

        for part in parts[1:]:
            gender = DWDS_GENUS_MAP.get(part.strip())
            if gender:
                result["gender_dwds"] = gender
                break

    genus = item.get("genus")
    if genus:
        result["gender_dwds"] = DWDS_GENUS_MAP.get(genus, result.get("gender_dwds"))

    freq = item.get("freq")
    if freq is not None:
        try:
            result["frequency_class"] = int(freq)
        except (ValueError, TypeError):
            pass

    return result


def _extract_corpus_examples(data: dict) -> list[dict]:
    """Extract clean sentence examples from DWDS corpus JSON."""
    examples = []
    hits = data.get("hits", []) if isinstance(data, dict) else []
    for hit in hits[:8]:
        # Reconstruct sentence from tokenised ctx_ array
        ctx = hit.get("ctx_", [])
        parts = []
        for token in ctx:
            if isinstance(token, list) and len(token) >= 2:
                parts.append(str(token[1]))
            elif isinstance(token, str):
                parts.append(token)
        sentence = " ".join(parts).strip()
        # Clean up spacing before punctuation
        sentence = re.sub(r'\s+([.,;:!?])', r'\1', sentence)

        meta = hit.get("meta_", {})
        ex = {"sentence": sentence}
        if meta.get("date_"):
            ex["date"] = str(meta["date_"])[:10]
        if meta.get("newspaper"):
            ex["source"] = meta["newspaper"]
        elif meta.get("title"):
            ex["source"] = meta["title"]
        if meta.get("textClass"):
            ex["genre"] = meta["textClass"]
        if sentence:
            examples.append(ex)
    return examples


def _extract_frequency_ts(data: list) -> list[dict]:
    """Extract [{year, f}] from DWDS stats response."""
    if not isinstance(data, list):
        return []
    points = []
    for item in data:
        try:
            year = int(item.get("year", 0))
            f = float(item.get("f", 0))
            if year > 1500:
                points.append({"year": year, "f": round(f, 2)})
        except (ValueError, TypeError):
            continue
    return points


def _extract_collocations(data: dict) -> list[str]:
    """Extract top collocations from DWDS word profile."""
    collocs = []
    if not isinstance(data, dict):
        return collocs

    # Word profile groups collocations by syntactic relation
    for relation_group in data.get("partitions", []):
        for entry in relation_group.get("entries", [])[:5]:
            lemma = entry.get("lemma", "").strip()
            if lemma and lemma not in collocs:
                collocs.append(lemma)
    return collocs[:20]


async def enrich_entry(entry_id: str) -> dict | None:
    """
    Fetch DWDS data for entry_id, merge into DB, return updated entry.
    Returns None if entry not found.
    """
    conn = get_write_conn()
    try:
        row = conn.execute("SELECT * FROM entries WHERE id = ?", (entry_id,)).fetchone()
        if row is None:
            return None
        entry = row_to_dict(row)
    except sqlite3.Error as e:
        logger.error("DB read error for %s: %s", entry_id, e)
        conn.close()
        return None

    lemma = entry["lemma"]
    sources = entry.get("sources") or {}
    updates: dict[str, Any] = {}

    ts = int(time.time() * 1000)

    async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:

        # ── Snippet (POS, gender, frequency class) ────────────────────────
        try:
            resp = await client.get(DWDS_SNIPPET_URL.format(word=lemma))
            if resp.status_code == 200:
                snippet_data = _extract_dwds_snippet(resp.json())
                if "frequency_class" in snippet_data and not entry.get("frequency_class"):
                    updates["frequency_class"] = snippet_data["frequency_class"]
                if "gender_dwds" in snippet_data and not entry.get("gender"):
                    updates["gender"] = snippet_data["gender_dwds"]
                sources["dwds_snippet"] = {"fetched_at": ts}
            else:
                logger.debug("DWDS snippet %s: HTTP %s", lemma, resp.status_code)
        except httpx.RequestError as e:
            logger.warning("DWDS snippet fetch failed for %s: %s", lemma, e)

        # ── Corpus examples ───────────────────────────────────────────────
        existing_examples = entry.get("corpus_examples") or []
        if not existing_examples:
            try:
                resp = await client.get(DWDS_CORPUS_URL.format(word=lemma))
                if resp.status_code == 200:
                    raw = resp.text
                    # DWDS corpus returns JSON lines or a single object
                    try:
                        data = resp.json()
                    except Exception:
                        data = {}
                    new_examples = _extract_corpus_examples(data)
                    if new_examples:
                        updates["corpus_examples"] = json.dumps(
                            new_examples, ensure_ascii=False
                        )
                        sources["dwds_corpus"] = {"fetched_at": ts, "count": len(new_examples)}
            except httpx.RequestError as e:
                logger.warning("DWDS corpus fetch failed for %s: %s", lemma, e)

        # ── Frequency time series ─────────────────────────────────────────
        if not entry.get("frequency_ts"):
            try:
                resp = await client.get(DWDS_FREQ_URL.format(word=lemma))
                if resp.status_code == 200:
                    ts_data = _extract_frequency_ts(resp.json())
                    if ts_data:
                        updates["frequency_ts"] = json.dumps(ts_data, ensure_ascii=False)
                        sources["dwds_freq"] = {"fetched_at": ts}
            except httpx.RequestError as e:
                logger.warning("DWDS freq fetch failed for %s: %s", lemma, e)

        # ── Word profile (collocations) ───────────────────────────────────
        existing_collocs = entry.get("collocations") or []
        if not existing_collocs:
            try:
                resp = await client.get(DWDS_PROFILE_URL.format(word=lemma))
                if resp.status_code == 200:
                    collocs = _extract_collocations(resp.json())
                    if collocs:
                        updates["collocations"] = json.dumps(collocs, ensure_ascii=False)
                        sources["dwds_profile"] = {"fetched_at": ts}
            except httpx.RequestError as e:
                logger.warning("DWDS profile fetch failed for %s: %s", lemma, e)

    # ── Write updates ─────────────────────────────────────────────────────
    if updates or sources != (entry.get("sources") or {}):
        updates["sources"] = json.dumps(sources, ensure_ascii=False)
        updates["updated_at"] = ts

        set_clause = ", ".join(f"{k} = ?" for k in updates)
        values = list(updates.values()) + [entry_id]
        try:
            conn.execute(f"UPDATE entries SET {set_clause} WHERE id = ?", values)
            conn.commit()
            logger.info("Enriched %s (%d fields updated)", entry_id, len(updates))
        except sqlite3.Error as e:
            logger.error("DB write error for %s: %s", entry_id, e)

    conn.close()

    # Return fresh entry
    fresh_conn = get_write_conn()
    row = fresh_conn.execute("SELECT * FROM entries WHERE id = ?", (entry_id,)).fetchone()
    result = row_to_dict(row) if row else None
    fresh_conn.close()
    return result
