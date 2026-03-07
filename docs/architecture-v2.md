# urwort — Architecture v2

## Why v2?

The v1 architecture treats the dictionary as a **file download problem**: fetch a JSON chunk per letter, scan it linearly. At 44k entries and 8.7MB per chunk (e.g. `s.json`), this causes:

- Hundreds of milliseconds of JSON parsing on first use of each letter
- O(n) linear scan of the full chunk on every keystroke
- Thousands of results serialised across the Worker→main thread boundary just to show 5
- 133MB of raw data in two redundant copies (disk + SW cache)
- A `wordCache` IndexedDB store that duplicates data already in the SW cache

The correct mental model is a **database query problem**: "give me words matching this prefix, fast". v2 rebuilds around that.

---

## Design principles

1. **IndexedDB is the primary search store** — not files, not memory arrays
2. **Separate index from data** — search never loads what it doesn't display
3. **One-time cost on first launch, instant forever after**
4. **Sources are additive and namespaced** — new sources never break old data
5. **API enrichment is background, non-blocking** — detail page renders from local data first
6. **Offline is the default** — network is an enhancement, not a requirement

---

## The three-payload rule

Every architectural decision flows from this table. Each moment in the UX has a different data need and latency budget:

| Moment | Data needed | Latency budget |
|---|---|---|
| As you type ("sch…") | word + pos + gender + 1 translation hint | **< 30ms** |
| Tap a word (detail view) | full translations + all examples | < 80ms |
| Etymology / cultural notes | rich text, collocations, usage stats | 200–800ms OK (network) |
| History tab | word + top-2 translations | < 50ms |
| Bookmarks tab | word + full entry | < 80ms |

These are three completely different payloads. v1 bundles all of them into one fat JSON per letter, meaning every layer pays the cost of every other layer. v2 stores each layer separately.

---

## Data layers

```
┌─────────────────────────────────────────────────────────────────┐
│  Layer 4 — User Data                                            │
│  history · bookmarks                                            │
│  Storage: IndexedDB, permanent, local only                      │
├─────────────────────────────────────────────────────────────────┤
│  Layer 3 — Enrichment  (API, background)                        │
│  etymology · collocations · usage stats · cultural context      │
│  Storage: appended into wordData.sources.{sourceid} in IDB      │
│  Fetched: on word detail open, silently, requires network       │
├─────────────────────────────────────────────────────────────────┤
│  Layer 2 — Full Entry  (local, lazy populated)                  │
│  all translations · all examples · source metadata              │
│  Storage: wordData store in IDB, written on first detail open   │
│  Fetched: from full data chunk or API on cache miss             │
├─────────────────────────────────────────────────────────────────┤
│  Layer 1 — Search Index  (local, seeded once on first launch)   │
│  headword · pos · gender · one hint translation                 │
│  Storage: wordIndex store in IDB                                │
│  Queried: every keystroke, O(log n) via IDB key range           │
└─────────────────────────────────────────────────────────────────┘
```

---

## IndexedDB schema (Dexie v4)

### `wordIndex` — Layer 1, search

One row per word per direction. Small, always local, the target of every search query.

```js
db.version(4).stores({
  wordIndex: 'id, word, dir, pos',
  // id = "word|dir"  e.g. "Haus|de-en"
  // Compound index [word+dir] for prefix queries scoped to direction
});
```

Row shape:

```json
{
  "id":     "Haus|de-en",
  "word":   "Haus",
  "dir":    "de-en",
  "pos":    "noun",
  "gender": "n",
  "hint":   "house"
}
```

Size: ~60 bytes × 680,000 entries ≈ **~40 MB** of IDB storage.
Query: `db.wordIndex.where('word').startsWith(q).filter(r => r.dir === dir).limit(20)`
Complexity: **O(log n)** to find prefix start, O(k) to walk results. ~5–10ms on mobile.

### `wordData` — Layer 2 + 3, full entry

One row per word per direction. Written lazily on first detail view. Never queried for search.

```js
wordData: 'id, word, dir, cachedAt',
// id = "word|dir"
```

Row shape:

```json
{
  "id":       "Haus|de-en",
  "word":     "Haus",
  "dir":      "de-en",
  "pos":      "noun",
  "gender":   "n",
  "cachedAt": 1741600000000,
  "l1": {
    "en": ["house", "home", "building", "household"],
    "ex": ["Das Haus ist sehr groß. :: The house is very large."]
  },
  "sources": {
    "freedict": { "senses": 3 },
    "kaikki":   { "ipa": "/haʊs/", "etymology": "From OHG hūs…" },
    "dwds":     { "usage": [...], "collocations": [...] }
  }
}
```

The `sources` object is a **namespace map** — additive by design. Adding a new source never requires migrating existing rows.

### `history` — Layer 4, unchanged

```js
history: '++id, word, dir, ts, [word+dir]',
```

Row shape changes slightly: `translations[]` field is removed. The hint is read at render time from `wordIndex` via a cheap `.get()`.

### `bookmarks` — Layer 4, unchanged

```js
bookmarks: 'id, word, dir, savedAt, [word+dir]',
```

Full entry stored at bookmark time, as before.

---

## Source registry

Each data source is declared in a central registry. The search path never touches API sources — they only activate on word detail open.

```js
const SOURCES = [
  {
    id:       'freedict',
    type:     'local',        // seeded into IDB on first run from JSON chunks
    role:     'backbone',     // always queried for both index and data
    coverage: ['de-en', 'en-de'],
    priority: 1,
  },
  {
    id:       'kaikki',
    type:     'local',        // downloaded once, seeded into IDB
    role:     'supplement',   // enriches L2 data (IPA, etymology, richer examples)
    coverage: ['de-en'],
    priority: 2,
  },
  {
    id:       'dwds',
    type:     'api',          // network only, requires online
    role:     'enrich',       // Layer 3, called on detail view open
    coverage: ['de-en'],      // German words only
    endpoint: 'https://www.dwds.de/api/wb/snippet/?q=',
    priority: 3,
  },
];
```

---

## Build script output (v2)

`tools/build-dict.py` outputs **two separate sets of chunks** per direction:

```
src/data/
├── de-en/
│   ├── index/                 ← Layer 1: slim, for seeding wordIndex
│   │   ├── a.json             ←   fields: word, pos, gender, hint (=en[0])
│   │   ├── b.json             ←   ~60 bytes/entry
│   │   └── …
│   └── data/                  ← Layer 2: full entries, for wordData on demand
│       ├── a.json             ←   fields: word, pos, gender, l1{en,ex}, sources
│       ├── b.json             ←   ~200 bytes/entry
│       └── …
└── en-de/
    ├── index/
    └── data/
```

Both sets drop `id`, `meta` (always null), and `sources` from the slim index. 

Size comparison:

| File | v1 | v2 index | v2 data |
|---|---|---|---|
| `s.json` | 8.7 MB | ~1.5 MB | ~5.5 MB |
| `a.json` | 6.5 MB | ~1.1 MB | ~4.1 MB |
| Total (de-en) | 68 MB | ~12 MB | ~45 MB |

The **index chunks are fetched once during seeding**, then never again. The **data chunks are fetched lazily** only when a word is opened for the first time.

---

## First launch: seeding flow

The one-time cost is made explicit with a progress UI. After that, search is instant forever.

```
App opens → localStorage.getItem('urwort:seeded')

  NOT seeded:
    Show seeding screen (full-page overlay, not dismissible)
    ┌───────────────────────────────────────────────────────┐
    │                                                       │
    │   Building your dictionary…                           │
    │   ██████████████░░░░░░   68%   a – m                 │
    │                                                       │
    │   This happens once. ~10–15 seconds on mobile.        │
    │   The app works fully offline after this.             │
    │                                                       │
    └───────────────────────────────────────────────────────┘

    Seeding worker (separate from search worker):
      For each direction [de-en, en-de]:
        For each letter [a..z, misc]:
          fetch /data/{dir}/index/{letter}.json
          extract slim rows
          db.wordIndex.bulkAdd(rows)   ← Dexie batch insert
          update progress bar

    On complete:
      localStorage.setItem('urwort:seeded', '1')
      hide overlay → app ready

  SEEDED:
    skip → app ready instantly
```

Expected seeding time: ~8–15 seconds on a mid-range phone (2021), one-time only.
Estimated seeding download: ~24MB total (both directions, index only).

---

## Search flow (v2)

```
User types "sch…"
    │
    ▼
app.js → debounce 200ms
    │
    ▼
IDB query (main thread or worker):
  db.wordIndex
    .where('word').startsWith('sch')
    .filter(r => r.dir === 'de-en')
    .limit(20)
    .toArray()
    │
    ▼  ~5–10ms, O(log n)
    │
    ▼
UI.renderResults(rows)   ← word, pos, gender, hint already in the row
```

No chunk loading. No JSON parsing. No linear scan. No postMessage overhead.
The search worker becomes optional — IDB queries from the main thread are fast enough for 20-result prefix lookups. We can remove the worker complexity or keep it for LOOKUP.

---

## Word detail flow (v2)

```
User taps "Schule"
    │
    ▼
1. db.wordData.get('Schule|de-en')   ← IDB lookup, ~2ms
    │
    ├─ HIT → render immediately (full entry, offline forever)
    │        → background: check if enrichment needed (Layer 3)
    │
    └─ MISS → fetch /data/de-en/data/s.json (full chunk)
              find entry
              db.wordData.put(entry)   ← cache for next time
              render
              → background: enrichment fetch

Background enrichment (if online + not yet enriched):
  fetch DWDS API for word
  merge into wordData.sources.dwds
  if detail page still open: silent re-render of etymology section
```

---

## Service Worker: simplified role

With IDB as the primary store, the SW does less:

| Request | Strategy | Rationale |
|---|---|---|
| App shell (HTML, CSS, JS) | Cache-first, pre-cached on install | Unchanged from v1 |
| `/data/{dir}/index/*.json` | Cache during seeding, then irrelevant | Only needed for initial seed |
| `/data/{dir}/data/*.json` | Cache-first, lazy | For wordData misses |
| External API calls (DWDS etc.) | Network-only, no cache | API responses shouldn't be cached by SW |

The SW no longer needs to serve data for search — IDB handles that. Its role narrows to: keep the app shell alive offline.

---

## Offline behaviour (v2)

| Scenario | Result |
|---|---|
| App not yet seeded, offline | Cannot seed. Show "Connect to internet to build dictionary." |
| App seeded, offline | Full search works (IDB). Any word ever opened shows full detail. |
| App seeded, offline, word never opened | Search card shows (hint from index). Detail shows partial (index data only). |
| App seeded, online | Full search + full detail + background enrichment. |
| API enrichment, offline | Silently skipped. No error shown. Retried next time word is opened online. |

---

## Implementation plan

Each step is self-contained and testable before the next begins.

### Step 1 — Split build output
Modify `tools/build-dict.py`:
- Output `src/data/{dir}/index/{letter}.json` (slim: word, pos, gender, en[0] only)
- Output `src/data/{dir}/data/{letter}.json` (full: current schema minus `id` and `meta`)
- Update `.gitignore` to ignore `data/` subdirs, commit only sample `index/h.json`

### Step 2 — Extend Dexie schema
Add `wordIndex` and rename `wordCache` → `wordData` in `db.js`:
- Schema v4: add `wordIndex` store
- Schema v4: rename `wordCache` to `wordData` (migration)
- Add `wordIndexGet`, `wordIndexSeed`, `wordDataGet`, `wordDataPut` functions

### Step 3 — Seeding UI + logic
Add seeding worker (`seed.worker.js`) and progress overlay to `index.html`:
- Check `localStorage` flag on app start
- If not seeded: show overlay, spawn seeding worker
- Worker fetches all index chunks, calls `db.wordIndex.bulkAdd()` per letter
- Reports progress via `postMessage`
- On complete: set flag, hide overlay

### Step 4 — Rewrite search to query IDB
Replace `search.worker.js` chunk-fetch logic with IDB prefix query:
- `db.wordIndex.where('word').startsWith(q).filter(...).limit(20).toArray()`
- Keep worker structure for future-proofing, but query IDB from it
- Remove chunk fetching from search path entirely

### Step 5 — Rewrite word detail to use `wordData`
In `app.js → openDetail()`:
- Check `wordData.get()` first
- On miss: fetch from `/data/{dir}/data/{letter}.json`, extract, store
- Remove old `wordCache` references

### Step 6 — Source registry module
Create `js/sources.js`:
- Define `SOURCES` array
- `enrichWord(word, dir)` function: fetches API sources, merges into `wordData`
- Called as a background task from `openDetail()` after initial render

### Step 7 — Add kaikki.org to build pipeline
Extend `build-dict.py` to merge kaikki data:
- Parse kaikki JSON format
- Merge into existing entries under `sources.kaikki`
- Re-run seeding (or provide a patch/update mechanism)

### Step 8 — DWDS enrichment
In `sources.js`:
- Implement `fetchDWDS(word)` → parses API response
- Writes to `wordData.sources.dwds`
- Detail page re-renders etymology section silently

---

## What stays the same

- Vanilla HTML/CSS/JS — no build tools, no frameworks
- Service Worker for app shell offline
- Hash-based routing
- Bottom nav, header toggle, all current UI
- `history` and `bookmarks` Dexie stores (minor simplification only)
- Docker dev/prod setup
- Build script language (Python)
- FreeDict as data backbone

---

## Key numbers (expected after v2)

| Metric | v1 | v2 |
|---|---|---|
| Search latency (warm) | 80–200ms | < 10ms |
| Search latency (first letter, cold) | 500–2000ms (chunk parse) | < 10ms (IDB ready) |
| First meaningful search (first launch) | Instant (but slow results) | After one-time ~10s seed |
| Data downloaded for search | Per-letter chunk, 1.5–9MB each | Once, ~24MB total |
| Storage on device | SW cache ~133MB | IDB ~40MB index + lazy wordData |
| Largest in-memory object during search | 44k-entry array | 20-entry result array |
| Offline search coverage | Per-letter (only fetched letters) | Full dictionary, always |
