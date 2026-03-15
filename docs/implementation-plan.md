# urwort — Implementation Plan

> Step-by-step plan to rebuild urwort from the current state to the new
> architecture. Designed to be done incrementally — each phase produces
> a working system. Keep it simple.
>
> Prerequisites: Read `docs/data-sources.md` and `docs/canonical-schema.md` first.

---

## Table of Contents

1. [Architecture Summary](#1-architecture-summary)
2. [Phase 0 — Project Setup & Tooling](#2-phase-0--project-setup--tooling)
3. [Phase 1 — Server SQLite + Build Pipeline](#3-phase-1--server-sqlite--build-pipeline)
4. [Phase 2 — FastAPI Sync + Enrichment Endpoints](#4-phase-2--fastapi-sync--enrichment-endpoints)
5. [Phase 3 — Client Rewrite (IndexedDB + Sync)](#5-phase-3--client-rewrite-indexeddb--sync)
6. [Phase 4 — Runtime Enrichment Pipeline](#6-phase-4--runtime-enrichment-pipeline)
7. [Phase 5 — Search & UI Polish](#7-phase-5--search--ui-polish)
8. [Phase 6 — Additional Data Sources](#8-phase-6--additional-data-sources)
9. [File Structure (Target)](#9-file-structure-target)
10. [Decisions & Trade-offs](#10-decisions--trade-offs)

---

## 1. Architecture Summary

```
┌────────────────────────────────────────────────────┐
│                   BUILD TIME                        │
│                                                     │
│   raw-data/          tools/build-db.py              │
│   ├── freedict/  ──►  ┌──────────────┐             │
│   ├── kaikki/    ──►  │ Parse, merge │──► data/     │
│   ├── unimorph/  ──►  │ normalize to │   urwort.db  │
│   ├── ipa-dict/  ──►  │ canonical    │   (SQLite)   │
│   ├── cefr/      ──►  │ schema       │              │
│   └── openthes/  ──►  └──────────────┘              │
└────────────────────────────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────┐
│                    SERVER                           │
│                                                     │
│   FastAPI + urwort.db (SQLite, read-mostly)         │
│                                                     │
│   Endpoints:                                        │
│   ├── GET /api/sync?since=TS&limit=500              │
│   ├── GET /api/enrich/{lemma}                       │
│   ├── GET /api/search?q=...   (optional, v2)        │
│   └── GET /api/health                               │
│                                                     │
│   Background tasks:                                 │
│   └── DWDS enrichment worker (fills entries lazily) │
└────────────────────────────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────┐
│                    CLIENT (PWA)                     │
│                                                     │
│   IndexedDB (Dexie) — synced from server            │
│   ├── entries    (full dictionary entries)           │
│   ├── forms      (inflected form → lemma index)     │
│   ├── history    (local only)                       │
│   └── bookmarks  (local only)                       │
│                                                     │
│   Search: prefix query on entries.lemma + forms.form│
│   Detail: read entries by id, render all fields     │
│   Offline: everything works from IndexedDB          │
└────────────────────────────────────────────────────┘
```

**Key insight**: The server does the heavy data processing. The client just
syncs down the processed entries and provides fast local search. No client-side
parsing, no client-side normalization, no client-side API calls to external
services.

---

## 2. Phase 0 — Project Setup & Tooling

**Goal**: Clean project structure, dependencies, dev environment.

### Tasks

- [ ] Create new directory structure (see section 9)
- [ ] Set up Python virtual environment with dependencies:
  - `fastapi`, `uvicorn` — API server
  - `httpx` — async HTTP client (for DWDS/Kaikki API)
  - `pydantic` — request/response validation
  - No ORM needed — raw `sqlite3` is fine for our schema
- [ ] Update `docker-compose.dev.yml`:
  - API service mounts `data/urwort.db` as a volume
  - Single SQLite file — no database container needed
- [ ] Create `tools/requirements.txt` for build tools:
  - `idzip` or `dictzip` — for decompressing StarDict files
  - Standard library (`json`, `sqlite3`, `html.parser`, `gzip`) handles the rest
- [ ] Verify raw data is available in `raw-data/`:
  - FreeDict StarDict files ✅ (already present)
  - Download Kaikki German combined JSONL (~2GB compressed)
  - Download UniMorph German TSV (~50MB)
  - Download IPA-dict German TSV (~3MB)
  - Download OpenThesaurus SQL dump (~5MB)
  - Prepare CEFR word lists (compile from open sources into simple TSV)

### Deliverable

- Working dev environment
- All raw data downloaded and available
- Clean directory tree ready for implementation

### Time estimate: 1-2 hours

---

## 3. Phase 1 — Server SQLite + Build Pipeline

**Goal**: Single Python script (`tools/build-db.py`) reads all bulk sources and
produces `data/urwort.db` — a ready-to-serve SQLite database.

### Tasks

#### 1.1 Create SQLite schema

- [ ] Write `tools/schema.sql` — copy from `docs/canonical-schema.md` section 2
- [ ] Script creates fresh DB, runs schema

#### 1.2 Parse FreeDict → entries

- [ ] Read existing `tools/build-dict.py` logic for StarDict parsing
- [ ] Adapt to produce `entries` rows:
  - `id`: `{word}|{pos_mapped_to_UPOS}`
  - `translations`: JSON array from `<span lang="en">` contents
  - `gender`: regex from POS line
  - `examples`: from `<div class="example">` pairs
  - `sources`: `{"freedict": {"extracted_at": ..., "senses": N}}`
- [ ] INSERT OR IGNORE — FreeDict is lowest priority, goes first

#### 1.3 Parse Kaikki bulk JSONL → entries + forms

This is the biggest step. Process the combined German JSONL line by line:

- [ ] **For lemma entries** (no `form_of` in senses):
  - Map `pos` → UPOS
  - Extract `head_templates` → gender, genitive, plural, auxiliary, verb_class
  - Extract `senses[]` → glosses, tags, examples, synonyms, antonyms, related, derived, hypernyms, hyponyms
  - Extract `sounds[]` → ipa, audio_url, rhymes, homophones
  - Extract `etymology_text`
  - Extract `categories`, `hyphenation`, `wikidata`, `wikipedia`, `proverbs`, `literal_meaning`
  - INSERT OR REPLACE — Kaikki data overwrites FreeDict where both exist

- [ ] **For inflected form entries** (has `form_of` in senses):
  - Extract `word` → `forms.form`
  - Extract `senses[0].form_of[0].word` + POS → `forms.entry_id`
  - Extract `senses[0].tags` → `forms.tags`
  - INSERT into `forms` table

- [ ] **Progress logging**: Print `[12345/500000] processing...` every 1000 entries

#### 1.4 Import UniMorph → supplement forms

- [ ] Parse TSV: `lemma\tform\tfeatures`
- [ ] Map features to our tag format: `N;NOM;SG` → `["nominative", "singular"]`
- [ ] INSERT OR IGNORE into `forms` table (don't overwrite Kaikki data)
- [ ] Also: for any lemma+form pairs that add forms missing from Kaikki's `inflections` JSON, update the `entries.inflections` field

#### 1.5 Import IPA-dict → supplement pronunciation

- [ ] Parse TSV: `word\tIPA`
- [ ] For each word, find matching `entries.id` by lemma
- [ ] UPDATE entries SET ipa = ? WHERE id = ? AND ipa IS NULL

#### 1.6 Import OpenThesaurus → supplement synonyms

- [ ] Parse SQL dump (extract INSERT statements) OR download TSV if available
- [ ] For each synset: find matching `entries.id` by lemma
- [ ] Merge synonyms into existing `entries.synonyms` array (union, deduplicate)
- [ ] Import synset hierarchy into hypernyms/hyponyms where available
- [ ] Import `level` (register label) into `entries.usage_labels`

#### 1.7 Import CEFR word lists → tag levels

- [ ] Parse simple word list TSV: `word\tlevel`
- [ ] UPDATE entries SET cefr_level = ? WHERE lemma = ?

#### 1.8 Build FTS index

- [ ] Populate `entries_fts` from completed `entries` table
  (triggers handle this automatically if we INSERT after CREATE TRIGGER)

#### 1.9 Optimize & ship

- [ ] Run `VACUUM` and `ANALYZE` on the final database
- [ ] Print stats: total entries, forms, sources breakdown
- [ ] Copy to `data/urwort.db`

### Deliverable

- `tools/build-db.py` — single script, runs in 5-15 minutes
- `data/urwort.db` — ~50-100MB SQLite database with ~200k entries + ~2M forms
- All bulk sources merged, normalized, cross-referenced

### Time estimate: 6-10 hours

---

## 4. Phase 2 — FastAPI Sync + Enrichment Endpoints

**Goal**: Simple API server that serves entries from SQLite and enriches them
with DWDS data on demand.

### Tasks

#### 2.1 Rewrite API core

- [ ] `api/main.py` — FastAPI app with:
  - `GET /api/health` — basic health check
  - `GET /api/sync?since={unix_ms}&limit={n}&include_forms={bool}` — paginated sync
  - `GET /api/enrich/{entry_id}` — trigger DWDS enrichment for one entry
  - CORS middleware (allow PWA origin)

#### 2.2 Sync endpoint

```python
@app.get("/api/sync")
async def sync(since: int = 0, limit: int = 500, include_forms: bool = True):
    conn = get_db()
    entries = conn.execute(
        "SELECT * FROM entries WHERE updated_at > ? ORDER BY updated_at LIMIT ?",
        (since, limit)
    ).fetchall()

    forms = []
    if include_forms and entries:
        entry_ids = [e["id"] for e in entries]
        placeholders = ",".join("?" * len(entry_ids))
        forms = conn.execute(
            f"SELECT * FROM forms WHERE entry_id IN ({placeholders})",
            entry_ids
        ).fetchall()

    next_cursor = entries[-1]["updated_at"] if entries else since
    return {
        "entries": [dict(e) for e in entries],
        "forms": [dict(f) for f in forms],
        "next_cursor": next_cursor,
        "has_more": len(entries) == limit
    }
```

#### 2.3 Enrich endpoint

- [ ] On `GET /api/enrich/{entry_id}`:
  1. Read current entry from SQLite
  2. Parse `entry_id` → lemma + POS
  3. Fetch DWDS snippet API → extract `freq`, `genus`, `url`
  4. Fetch DWDS full entry API → extract definitions_de, usage labels, compound info
  5. Fetch DWDS corpus API → extract corpus examples
  6. Fetch DWDS frequency API → extract time series
  7. Fetch DWDS word profile API → extract collocations
  8. Merge all new data into entry (only update NULL/empty fields)
  9. Update `entries.sources` JSON, set `entries.updated_at = now()`
  10. Return updated entry

- [ ] Rate limit: max 1 DWDS request per second (respect their API)
- [ ] Error handling: if DWDS returns 404, log it, don't crash

#### 2.4 Background enrichment worker (optional but recommended)

- [ ] On server start, optionally run a background task that:
  1. Finds entries with `sources` missing 'dwds_snippet' key
  2. Prioritizes by frequency_class (common words first) or CEFR level
  3. Enriches one entry every 2 seconds
  4. Runs indefinitely, pauses when caught up
- [ ] This gradually fills the database with DWDS data without user interaction

#### 2.5 Database connection management

- [ ] Use `sqlite3.connect("data/urwort.db", check_same_thread=False)`
- [ ] Enable WAL mode: `PRAGMA journal_mode=WAL` — allows concurrent reads
- [ ] Read-only for sync; read-write for enrichment
- [ ] Single writer is fine — SQLite handles this natively

### Deliverable

- Rewritten `api/main.py` with sync + enrich endpoints
- Server reads from `data/urwort.db`, enriches entries on demand
- Background worker gradually enriches common words

### Time estimate: 4-6 hours

---

## 5. Phase 3 — Client Rewrite (IndexedDB + Sync)

**Goal**: PWA client syncs entries from server, stores in IndexedDB,
provides fast offline search.

### Tasks

#### 3.1 Rewrite `src/js/db.js`

- [ ] New Dexie schema (v5) as defined in `docs/canonical-schema.md`
- [ ] Migration: detect old v4 stores → clear and resync (clean break)
- [ ] `db.meta` store for sync bookkeeping

#### 3.2 Create `src/js/sync.js`

- [ ] `sync()` function:
  1. Read `last_sync_ts` from `db.meta` (default: 0)
  2. Fetch `GET /api/sync?since={ts}&limit=500`
  3. `db.entries.bulkPut(response.entries)` — Dexie upserts automatically
  4. `db.forms.bulkPut(response.forms)` — same
  5. Update `db.meta.put({key: 'last_sync_ts', value: response.next_cursor})`
  6. If `response.has_more`, repeat from step 2
  7. Return stats: `{synced: N, total_time: Tms}`

- [ ] Call `sync()` on app start (non-blocking — UI works from existing data)
- [ ] Call `sync()` periodically (every 30 min if app is open)
- [ ] Handle offline: if fetch fails, skip silently, try again later

#### 3.3 Rewrite `src/js/search.js`

- [ ] **Primary search**: Dexie `entries.where('lemma').startsWithIgnoreCase(query)`
- [ ] **Inflected form search**: Dexie `forms.where('form').equals(query)`
  → Get `entry_id` → load from `entries`
- [ ] **Merge results**: union of both, lemma matches ranked first
- [ ] **Auto-capitalize**: if no results, try capitalizing first letter (German nouns)
- [ ] **Debounce**: 150ms before firing search
- [ ] All search is local IndexedDB — no network needed

#### 3.4 Rewrite `src/js/ui.js`

- [ ] **Result card**: show lemma, POS badge, gender badge, first translation, CEFR badge
- [ ] **Detail view**: render all fields from canonical entry:
  - Header: lemma, IPA (with audio play button), gender, POS, CEFR level
  - Translations section
  - German definitions section (if enriched with DWDS)
  - Senses with examples
  - Inflection table (organized by case × number for nouns, by tense/person for verbs)
  - Synonyms, antonyms, related words (as clickable chips)
  - Etymology section
  - Corpus examples (if enriched)
  - Frequency chart (if enriched — simple sparkline or bar)
  - Collocations (if enriched)
  - Proverbs (if any)
  - Source attribution footer

- [ ] **Enrich button**: "Load more info" → calls `/api/enrich/{id}` → re-renders

#### 3.5 Rewrite `src/js/app.js`

- [ ] Initialization flow:
  1. Register service worker
  2. Initialize Dexie DB
  3. Render UI from existing IndexedDB data (instant)
  4. Start background `sync()` (non-blocking)
  5. Wire up search, routing, history, bookmarks

- [ ] Remove: old seeding logic, chunk loading, search.worker.js, seed.worker.js

#### 3.6 Update service worker (`src/sw.js`)

- [ ] Cache app shell (HTML, CSS, JS) — same as before
- [ ] **Remove** data chunk caching — no more JSON chunks
- [ ] API responses are NOT cached by SW — IndexedDB is our cache

### Deliverable

- Client app that syncs from server and works fully offline
- Fast local search across ~200k entries + ~2M forms
- Rich detail view with all available data fields
- No external API calls from client — server does all enrichment

### Time estimate: 8-12 hours

---

## 6. Phase 4 — Runtime Enrichment Pipeline

**Goal**: When a user looks up a word, trigger server-side enrichment so the
entry gets richer over time.

### Tasks

#### 4.1 On-demand enrichment trigger

- [ ] When client opens detail view for an entry that lacks DWDS data:
  - Client sends `GET /api/enrich/{entry_id}` to server
  - Server fetches from DWDS, merges, updates SQLite, returns enriched entry
  - Client updates local IndexedDB with enriched entry
  - UI re-renders with new data

#### 4.2 Enrichment status indicator

- [ ] UI shows which sources have contributed to the current entry
- [ ] Small badges or dots: ✅ FreeDict ✅ Kaikki ⏳ DWDS ...
- [ ] "Enriching..." spinner while API call is in flight

#### 4.3 Kaikki API fallback

- [ ] For words not in the bulk data (new words, rare words):
  - Server can also fetch from Kaikki API: `kaikki.org/dictionary/German/meaning/{w}.jsonl`
  - Parse and merge same as build-time logic
  - Store in SQLite as new entry

### Deliverable

- Entries get richer as users interact with them
- DWDS data fills in gradually — no bulk download needed
- New words discoverable through Kaikki API

### Time estimate: 3-4 hours

---

## 7. Phase 5 — Search & UI Polish

**Goal**: Make search excellent and the UI useful for study.

### Tasks

#### 5.1 Search improvements

- [ ] **Reverse search** (EN → DE): search within `translations` field
  - IndexedDB limitation: can't FTS within JSON arrays
  - Solution: maintain a thin `translations_index` table:
    `{english_word, entry_id}` — built during sync
  - Or: just use a Dexie filter: `entries.filter(e => e.translations.some(...))`
    (slower but works for small result sets)
- [ ] **Fuzzy tolerance**: if exact prefix finds < 3 results, show "did you mean?" suggestions
  - Simple approach: Levenshtein on lemma first 3 chars matching
  - Only run against entries already in IndexedDB (fast, ~200k comparisons)

#### 5.2 Study features

- [ ] **Bookmark/Save words**: already have bookmarks store — render saved words list
- [ ] **History**: already have history store — show recent lookups
- [ ] **CEFR filter**: toggle to only show A1/A2/B1/B2/C1/C2 words
- [ ] **Random word**: "Word of the day" from entries at user's CEFR level
- [ ] **Inflection quiz**: show inflected form, ask for lemma (uses forms table)

#### 5.3 UI polish

- [ ] Responsive layout (works on mobile and desktop)
- [ ] Dark/light mode
- [ ] Tap IPA to play audio (if audio_url exists)
- [ ] Clickable word chips (synonyms, related, derived) → navigate to that entry
- [ ] Smooth transitions between search and detail view

### Deliverable

- Polished, study-oriented dictionary app
- Fast and useful search in both directions
- Study features that leverage the rich data

### Time estimate: 6-8 hours

---

## 8. Phase 6 — Additional Data Sources

**Goal**: Incrementally add new sources. Each is independent — just re-run build.

### Tasks (each independent)

- [ ] **Leipzig Corpora**: import frequency data + sentence examples
  - Download German news corpus (~200MB compressed)
  - Parse `words.txt` → update `frequency_per_m` where null
  - Parse `sentences.txt` → add corpus examples where needed
  - Parse `co_n.txt` → add collocations where null

- [ ] **Wikidata Lexemes**: add semantic grounding
  - SPARQL query for German lexemes with forms
  - Store `wikidata_id` on matching entries
  - Future: use Q-IDs for cross-language linking

- [ ] **Tatoeba sentences**: bilingual example sentences
  - Download German-English sentence pairs
  - Match to entries by lemma occurrence
  - Supplement `examples` field

### Time estimate: 2-4 hours per source

---

## 9. File Structure (Target)

```
urwort/
├── api/
│   ├── __init__.py
│   ├── main.py              # FastAPI app (sync, enrich, health)
│   ├── db.py                # SQLite connection + helpers
│   ├── enrichment.py        # DWDS + Kaikki API fetch + merge logic
│   ├── models.py            # Pydantic models for API responses
│   ├── config.py            # Configuration (env vars)
│   └── requirements.txt
│
├── tools/
│   ├── build-db.py          # Main build script: raw-data → urwort.db
│   ├── schema.sql           # SQLite schema DDL
│   ├── requirements.txt     # Build tool dependencies
│   └── download-sources.sh  # Script to download all bulk sources
│
├── data/
│   └── urwort.db            # Built SQLite database (gitignored)
│
├── raw-data/
│   ├── freedict/            # StarDict files (existing)
│   ├── kaikki/              # Downloaded JSONL files
│   ├── unimorph/            # German morphology TSV
│   ├── ipa-dict/            # IPA pronunciations TSV
│   ├── openthesaurus/       # SQL dump or TSV
│   └── cefr/                # CEFR word lists
│
├── src/
│   ├── index.html
│   ├── manifest.json
│   ├── sw.js
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── app.js           # App initialization + routing
│       ├── db.js            # Dexie schema + helpers
│       ├── sync.js          # Server sync logic
│       ├── search.js        # Local IndexedDB search
│       ├── ui.js            # DOM rendering
│       └── vendor/
│           └── dexie.min.js
│
├── docs/
│   ├── data-sources.md      # Complete source field inventory
│   ├── canonical-schema.md  # Database schema spec
│   ├── implementation-plan.md  # This document
│   └── ...
│
├── docker-compose.yml
├── docker-compose.dev.yml
├── Dockerfile.api
├── Dockerfile.prod
└── README.md
```

### Files to remove (from old architecture)

- `src/data/` — all JSON chunks (replaced by SQLite sync)
- `src/js/seed.worker.js` — no more client-side seeding
- `src/js/search.worker.js` — search is fast enough on main thread
- `src/js/kaikki.js` — client no longer calls external APIs
- `src/js/dwds.js` — client no longer calls external APIs
- `api/cache.py` — SQLite is our cache
- `api/kaikki.py` — moved to `api/enrichment.py`
- `api/dwds.py` — moved to `api/enrichment.py`

---

## 10. Decisions & Trade-offs

### Why SQLite on the server (not Postgres)?

- Single file — easy to back up, easy to deploy, zero config
- Fast enough for our read-heavy workload (~200k entries)
- WAL mode handles concurrent reads during enrichment writes
- FTS5 built in — no need for ElasticSearch or similar
- Python stdlib `sqlite3` — no extra dependencies
- Can copy the file directly for debugging/testing

### Why IndexedDB on the client (not SQLite/WASM)?

- **Native to every browser** — no WASM binary to load (700KB+ for sql.js)
- **Dexie.js is excellent** — battle-tested, <25KB, great indexed queries
- **Prefix search is fast** — Dexie's `startsWithIgnoreCase` uses B-tree index
- **bulkPut is fast** — can insert 500 entries in <50ms
- **Simpler stack** — one less technology to maintain

### Why not keep both client-side SQLite and server-side SQLite?

- Tempting (same schema!), but sql.js WASM adds 700KB+ to initial load
- IndexedDB indexed queries are fast enough for our access patterns
- Sync is simpler with Dexie's `bulkPut` (upsert) than raw SQL
- We don't need complex queries on the client (JOINs, GROUP BY)

### Why sync instead of JSON chunks?

- **Incremental**: after initial sync, only changed entries are transferred
- **Enrichment propagates**: when server enriches an entry, next sync picks it up
- **One source of truth**: server SQLite is authoritative
- **Smaller payload**: entries are ~500B average, vs. per-letter JSON chunks with redundancy
- **No seeding flow**: sync replaces the complex seed worker + checkpoint logic

### Why server-side enrichment (not client-side)?

- **Rate limiting**: server manages one DWDS connection, respects rate limits
- **Shared benefit**: one user's enrichment benefits all users on next sync
- **Simpler client**: no API keys, no error handling for external services
- **Offline resilience**: client doesn't need network for full features

### Estimated total sizes

| Component | Size |
|-----------|------|
| Server SQLite (build-time only) | ~50 MB |
| Server SQLite (fully enriched) | ~100-150 MB |
| Client IndexedDB (initial sync) | ~40-60 MB |
| Client IndexedDB (fully enriched) | ~80-120 MB |
| App shell (HTML + CSS + JS) | ~100 KB |
| Dexie.js | ~25 KB |

### Performance targets

| Operation | Target |
|-----------|--------|
| Initial sync (WiFi) | < 2 minutes |
| Incremental sync | < 5 seconds |
| Search (prefix, local) | < 50ms for results |
| Inflected form lookup | < 100ms |
| Entry detail render | < 20ms |
| DWDS enrichment (per word) | < 3 seconds |

---

## Summary: Implementation Order

| Phase | What | Depends on | Est. Hours |
|-------|------|-----------|-----------|
| **0** | Project setup, download raw data | — | 1-2h |
| **1** | Build pipeline → SQLite | Phase 0 | 6-10h |
| **2** | FastAPI sync + enrich API | Phase 1 | 4-6h |
| **3** | Client rewrite (sync + search + UI) | Phase 2 | 8-12h |
| **4** | Runtime enrichment pipeline | Phase 2, 3 | 3-4h |
| **5** | Search & UI polish | Phase 3 | 6-8h |
| **6** | Additional data sources | Phase 1 | 2-4h each |
| | **Total** | | **~30-46h** |

Each phase produces a working system. You can ship after Phase 3.

---

*Last updated: 2026-03-07*
*This plan supersedes docs/architecture-v2.md for new development.*
