# urwort

deutsch ↔ english dictionary + learning guide
simple lightweight offline first privacy focused mobile progressive web app

## features
- bidirectional dictionary (de→en and en→de)
- curated deutsche resources
- books / graded reading material
- word search history
- bookmarked / starred words
- local offline caching via IndexedDB
- PWA installable, works fully offline after first load

## confirmed design decisions
- data: per-letter chunked json files (a.json … z.json), lazy loaded + cached on demand by service worker
- search: as-you-type at ≥2 chars with debounce (~200ms)
- direction: bidirectional (de→en and en→de)
- verb conjugation / noun declension: out of scope for v1

## tech stack
- vanilla HTML + CSS + JS — zero build tools, zero npm
- service worker + cache API — offline shell and data
- indexedDB — search history, bookmarks, user progress
- static json dictionary files — curated open source (freedict, kaikki.org)
- hash-based routing (#search, #history, #bookmarks, #resources)
- deployed to github pages or cloudflare pages (free, static)

## dictionary data sources
- freedict deu-eng (TEI XML → convert to JSON)
- kaikki.org (wiktionary-derived JSON, ready to use)
- separate tools/build-dict.py pipeline to normalize → output per-letter chunks

## project structure
urwort/
├── index.html
├── manifest.json
├── sw.js
├── css/app.css
├── js/
│   ├── app.js       # init, hash routing, state
│   ├── db.js        # indexedDB wrapper
│   ├── search.js    # search logic, debounce, ranking
│   └── ui.js        # DOM rendering helpers
├── data/
│   ├── de-en/       # a.json … z.json  (german → english)
│   └── en-de/       # a.json … z.json  (english → german)
├── icons/
└── docs/

## implementation phases
### phase 1 — shell & offline core
- index.html mobile layout (search bar, bottom nav)
- manifest.json + icons → PWA installable
- sw.js → cache shell on install, data chunks on demand
- app.css → mobile-first, system fonts, prefers-color-scheme dark mode

### phase 2 — dictionary search
- load per-letter chunk on first keystroke for that letter
- search.js: prefix match → substring match → ranked results
- bidirectional: detect input language or let user toggle de/en
- render: word, gender (for nouns), part of speech, translations, example

### phase 3 — local persistence
- db.js thin IndexedDB wrapper: save / get / list / delete
- search history (last 100 entries)
- bookmarked words
- reading progress

### phase 4 — resources & reading
- curated links page (cached offline)
- graded reader texts as embedded JSON/HTML

### phase 5 — data pipeline (tools/)
- tools/build-dict.py: pull freedict/kaikki → normalize → write per-letter chunks
- dictionary published as standalone open-source artifact

## data format (per entry)
{
  "w": "Haus",
  "pos": "noun",
  "gender": "n",
  "en": ["house", "home", "building"],
  "ex": ["Das Haus ist groß."]
}
