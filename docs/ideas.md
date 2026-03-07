# urwort

deutsch ↔ english dictionary + learning guide
simple lightweight offline first privacy focused mobile progressive web app

## features
- bidirectional dictionary (de→en and en→de)
- curated deutsche resources page
- word search history (with translation previews)
- bookmarked / starred words (stored offline)
- local offline caching via IndexedDB + service worker
- PWA installable, works fully offline after first load

## confirmed design decisions
- data: per-letter chunked json files (a.json … z.json), lazy loaded + cached on demand
- search: as-you-type at ≥2 chars with debounce (200ms), runs in a Web Worker
- direction: bidirectional toggle (DE↔EN) in header; auto-detects German input via umlauts
- verb conjugation / noun declension: out of scope for v1
- top 5 results shown in main list; full entry on detail page

## tech stack
- vanilla HTML + CSS + JS — zero build tools, zero npm
- service worker + cache API — offline shell and data
- IndexedDB via Dexie.js — search history, bookmarks, word cache
- Web Worker (search.worker.js) — search off the main thread
- static JSON dictionary files — FreeDict (GPL), kaikki.org (CC-BY-SA, planned)
- hash-based routing (#search, #history, #bookmarks, #resources, #settings, #detail)
- docker + nginx for local dev and production deployment
- deployed to github pages or cloudflare pages (free, static)

## dictionary data sources
- **FreeDict deu-eng / eng-deu** — StarDict format, parsed by tools/build-dict.py
- **kaikki.org** — wiktionary-derived JSON, planned for richer data
- **DWDS** — optional future API reference only (not bulk offline)
- tools/build-dict.py pipeline: parse StarDict → merge senses → output per-letter JSON chunks

## project structure
```
urwort/
├── src/
│   ├── index.html              # app shell (all pages inline)
│   ├── manifest.json           # PWA manifest
│   ├── sw.js                   # service worker
│   ├── css/app.css             # mobile-first styles, dark mode
│   ├── js/
│   │   ├── app.js              # init, routing, event wiring
│   │   ├── db.js               # IndexedDB via Dexie.js
│   │   ├── search.js           # main-thread bridge to worker
│   │   ├── search.worker.js    # search logic off-thread
│   │   ├── ui.js               # DOM rendering helpers
│   │   └── vendor/dexie.min.js
│   ├── data/
│   │   ├── de-en/              # a.json … z.json  (german → english)
│   │   └── en-de/              # a.json … z.json  (english → german)
│   └── icons/
├── tools/
│   └── build-dict.py           # data pipeline
├── raw-data/freedict/          # source StarDict files (gitignored)
├── docs/
│   ├── ideas.md                # this file
│   ├── architecture.md         # system design and components
│   └── data-pipeline.md        # data sources, schema, build steps
├── Dockerfile.dev / .prod
├── docker-compose.dev.yml / prod.yml
└── nginx.dev.conf / prod.conf
```

## implementation status
### done
- [x] app shell (index.html, manifest, icons, PWA installable)
- [x] service worker (shell pre-cache, data lazy-cache, offline fallback)
- [x] bidirectional search via Web Worker with debounce + scoring
- [x] per-letter JSON chunks for DE→EN and EN→DE (FreeDict)
- [x] Dexie.js IndexedDB with layered schema (history, bookmarks, wordCache)
- [x] search history with translation previews
- [x] bookmarks (full entry stored offline)
- [x] word detail page (translations, examples, gender badge)
- [x] direction toggle in header (auto-detects German input)
- [x] resources page (curated links)
- [x] settings page (placeholder)
- [x] docker dev (live reload via volume mount) and prod (baked, gzip)
- [x] git repo at github.com/yojuna/urwort

### planned
- [ ] kaikki.org data integration (richer translations + etymologies)
- [ ] CEFR level tags (A1–C2) on entries
- [ ] frequency ranking for result ordering
- [ ] settings: theme toggle, clear data, default direction
- [ ] graded reader texts (phase 4)
- [ ] DWDS API Layer 3 (etymology on demand)

## data entry format
```json
{
  "id":     "de_haus",
  "w":      "Haus",
  "pos":    "noun",
  "gender": "n",
  "meta":   { "freq": null, "level": null },
  "l1": {
    "en":  ["house", "home", "building"],
    "ex":  ["Das Haus ist groß. :: The house is big."]
  },
  "sources": { "freedict": { "senses": 3 } }
}
```

See `docs/data-pipeline.md` for full schema reference.
See `docs/architecture.md` for system design and component details.
