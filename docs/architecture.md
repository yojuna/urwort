# urwort — System Architecture

German ↔ English offline-first dictionary PWA.
Zero build tools. Zero dependencies except one (Dexie.js). Runs fully offline after first load.

---

## Guiding principles

| Principle | How it's applied |
|---|---|
| **Offline-first** | App shell pre-cached on install. Dictionary data cached on first use, forever after. |
| **No frameworks** | Vanilla HTML, CSS, JS only. No React, Vue, npm, or build step. |
| **Main thread stays free** | All search logic runs in a Web Worker. UI never blocks. |
| **Local data is truth** | IndexedDB holds history, bookmarks, and word cache. Nothing requires a server. |
| **Lazy by default** | Dictionary chunks are ~27 per direction. Only the chunk for the typed letter is ever fetched. |

---

## File structure

```
urwort/
├── src/                        # everything served by nginx
│   ├── index.html              # app shell — single HTML file
│   ├── manifest.json           # PWA manifest (name, icons, display mode)
│   ├── sw.js                   # service worker
│   ├── css/
│   │   └── app.css             # all styles (mobile-first, dark mode)
│   ├── js/
│   │   ├── app.js              # init, routing, event wiring
│   │   ├── db.js               # IndexedDB via Dexie.js
│   │   ├── search.js           # main-thread bridge → search.worker.js
│   │   ├── search.worker.js    # all search logic (off-thread)
│   │   ├── ui.js               # DOM rendering helpers
│   │   └── vendor/
│   │       └── dexie.min.js    # only JS dependency
│   ├── data/
│   │   ├── de-en/              # a.json … z.json + misc.json  (DE → EN)
│   │   └── en-de/              # a.json … z.json + misc.json  (EN → DE)
│   └── icons/
├── tools/
│   └── build-dict.py           # data pipeline (see data-pipeline.md)
├── raw-data/
│   └── freedict/               # source StarDict files (gitignored)
│       ├── deu-eng/
│       └── eng-deu/
├── docs/
│   ├── ideas.md
│   ├── architecture.md         # this file
│   └── data-pipeline.md
├── Dockerfile.dev / .prod
├── docker-compose.dev.yml / prod.yml
├── nginx.dev.conf / prod.conf
└── .gitignore
```

---

## Layered data architecture

The system treats data in four layers, each with a different storage strategy and lifetime.

```
┌─────────────────────────────────────────────────────────────────┐
│  Layer 4 — User Data                                            │
│  history · bookmarks · notes                                    │
│  Storage: IndexedDB (local only, permanent)                     │
├─────────────────────────────────────────────────────────────────┤
│  Layer 3 — Deep Dive  (future)                                  │
│  etymology · cultural context                                   │
│  Storage: API-first, persists to IndexedDB once viewed          │
├─────────────────────────────────────────────────────────────────┤
│  Layer 2 — Core Entry                                           │
│  full entry (translations, examples, pos, gender)               │
│  Storage: Cached in IndexedDB wordCache on first view           │
├─────────────────────────────────────────────────────────────────┤
│  Layer 1 — Index  ← what's in the JSON chunks                  │
│  headword · pos · gender · primary translations · examples      │
│  Storage: Static JSON files, cached by Service Worker           │
└─────────────────────────────────────────────────────────────────┘
```

Currently Layer 1 and Layer 2 are unified — the JSON chunks contain the full entry. When a word is opened, its entry is written to `wordCache` (Layer 2) so that even if the chunk is evicted from the SW cache, the viewed word is available offline forever.

---

## Component responsibilities

### `index.html` — App shell

Single HTML file. Defines all five pages as `<section>` elements. Only one is visible at a time via a CSS class (`.active`). Hash-based routing (`#search`, `#history`, `#bookmarks`, `#resources`, `#settings`, `#detail`).

Pages:
- **search** — search input + results list (default)
- **history** — recent searches with translations
- **bookmarks** — saved words with translations
- **resources** — curated external links
- **settings** — placeholder for future configuration
- **detail** — word detail view (not in nav; triggered by tapping a result)

---

### `sw.js` — Service Worker

Three caching strategies:

| Request path | Strategy | Cache store |
|---|---|---|
| `/data/**/*.json` | Cache-first, lazy populate | `urwort-data-v2` |
| App shell assets (HTML, CSS, JS, icons) | Cache-first, pre-cached on install | `urwort-shell-v4` |
| Everything else | Network-first, cache fallback | `urwort-shell-v4` |

On offline failure for data chunks, the SW returns `[]` so the app never crashes — it just shows no results.

The worker file (`search.worker.js`) is included in `SHELL_ASSETS` so it's pre-cached and spawnable offline.

On `activate`, old cache versions are deleted so clients always get fresh assets when the cache name is bumped.

---

### `search.worker.js` — Search logic (Web Worker)

Runs entirely off the main thread. The main thread never touches JSON arrays directly.

**In-memory chunk cache** — once a letter chunk is fetched, it stays in the worker's memory for the whole tab session. Subsequent searches for the same letter are instant.

**Message protocol:**

```
Main thread → Worker:
  { type: 'SEARCH', id, query, dir }   — debounced (200ms)
  { type: 'LOOKUP', id, word, dir }    — immediate, used by openDetail()

Worker → Main thread:
  { type: 'SEARCH_RESULT', id, status: 'loading'|'done', results[] }
  { type: 'LOOKUP_RESULT', id, entry | null }
  { type: 'ERROR', id, message }
```

**Scoring** (within a chunk):

| Match type | Score |
|---|---|
| Exact match | 3 |
| Prefix match | 2 |
| Substring match | 1 |

Results are sorted by score desc, then alphabetically by headword.

**Umlaut routing** — `ä/Ä → a`, `ö/Ö → o`, `ü/Ü → u`, `ß → s`. So typing "über" fetches `u.json`, not `misc.json`.

---

### `search.js` — Main-thread bridge

Thin wrapper. Spawns the worker once on first use. Routes `query()` and `lookup()` calls to the worker via `postMessage`. Only the most recent search callback is kept — stale results from a previous keystroke are discarded.

Auto-detects German input via umlaut characters (`äöüÄÖÜß`) and switches the direction toggle automatically.

---

### `db.js` — IndexedDB via Dexie.js

Three stores, schema at v3:

```
history   ++id, word, dir, ts, [word+dir]
bookmarks  id,  word, dir, savedAt, [word+dir]
wordCache  id,  word, dir, cachedAt
```

`[word+dir]` is a compound index enabling fast deduplication (`historyAdd`) and existence checks (`bookmarkExists`) without a full table scan.

**Key behaviours:**
- `historyAdd` deduplicates: re-searching an existing word bumps its timestamp to the top
- `historyAdd` stores `translations[]` (top-2 EN words) so the history list can show them without a lookup
- `bookmarkAdd` stores the full entry so bookmarks are viewable offline without re-fetching
- `wordCachePut` / `wordCacheGet` implement Layer 2: once you open a word it is cached in IndexedDB forever

---

### `ui.js` — Rendering

Pure DOM manipulation. No state. Called by `app.js` with data, returns nothing.

| Function | Purpose |
|---|---|
| `renderResults(entries, dir, bookmarkedSet)` | Result cards list, top 5 |
| `renderDetail(entry, dir)` | Word detail page |
| `renderHistory(items)` | History list with translations |
| `renderBookmarks(items)` | Bookmarks list |
| `setSearchStatus(msg, loading)` | Status line + spinner |
| `toast(msg)` | Temporary notification |

---

### `app.js` — Orchestrator

Initialises everything, wires all event listeners, owns the `state` object:

```js
state = {
  dir:           'de-en' | 'en-de',   // persisted to localStorage
  currentEntry:  { entry, dir } | null,
  bookmarkedSet: Set<'word|dir'>       // O(1) bookmark check in renderResults
}
```

**`openDetail` flow:**
1. Check `DB.wordCacheGet` (Layer 2, instant offline)
2. If miss → `Search.lookup` → worker fetches chunk → returns entry
3. Persist to `DB.wordCachePut`
4. Record to `DB.historyAdd` with translations
5. Call `UI.renderDetail`, wire bookmark button, push `#detail` hash

---

## Routing

Hash-based. No server-side routing needed — works with any static file host.

| Hash | View |
|---|---|
| `#search` (default) | Search page |
| `#history` | History page |
| `#bookmarks` | Bookmarks page |
| `#resources` | Resources page |
| `#settings` | Settings page |
| `#detail` | Word detail (no nav item) |

`hashchange` events are handled in `app.js`. The back button uses `history.back()`.

---

## Offline behaviour

| Scenario | Result |
|---|---|
| First load (online) | Shell cached, first search caches that letter chunk |
| Return visit (offline) | Shell served from SW cache instantly |
| Search for cached letter (offline) | Worker loads chunk from SW cache, full results |
| Search for uncached letter (offline) | SW returns `[]`, worker shows no results (graceful) |
| Open previously viewed word (offline) | Entry served from IndexedDB wordCache |
| Open un-viewed word (offline) | Worker fetch fails → empty fallback entry shown |

---

## Docker setup

| File | Purpose |
|---|---|
| `Dockerfile.dev` + `nginx.dev.conf` | Dev: `src/` mounted as volume, all headers `no-cache` |
| `Dockerfile.prod` + `nginx.prod.conf` | Prod: `src/` baked in, gzip, immutable asset headers |
| `docker-compose.dev.yml` | Dev compose, port 8080, volume mount |
| `docker-compose.prod.yml` | Prod compose, port 8080, no volume |
| `docker-compose.yml` | Convenience alias → dev config |

Run dev:
```bash
docker compose up
# open http://localhost:8080
# changes to src/ are live immediately (no rebuild)
```

Run prod:
```bash
docker compose -f docker-compose.prod.yml up --build
```
