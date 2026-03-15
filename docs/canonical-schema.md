# urwort — Canonical Schema

> Defines the unified data model for dictionary entries stored in the server
> SQLite database and synced to the client IndexedDB.
>
> All data from all sources is normalized into this schema.
> See `docs/data-sources.md` for the raw field inventory per source.

---

## Table of Contents

1. [Design Principles](#1-design-principles)
2. [Server SQLite Schema](#2-server-sqlite-schema)
3. [Client IndexedDB Schema](#3-client-indexeddb-schema)
4. [Canonical Entry Example](#4-canonical-entry-example)
5. [POS Tag Mapping](#5-pos-tag-mapping)
6. [Gender Normalization](#6-gender-normalization)
7. [Sync Protocol](#7-sync-protocol)

---

## 1. Design Principles

1. **One entry per lemma+POS** — "Haus" the noun and "Haus" the proper noun are separate entries.
   Key format: `{lemma}|{POS}` (e.g., `Haus|NOUN`, `laufen|VERB`).

2. **JSON columns for variable-shape data** — translations, senses, inflections,
   and semantic relations are stored as JSON strings. No child tables, no joins
   for the common case. SQLite's `json_extract()` handles queries when needed.

3. **Source provenance always tracked** — the `sources` JSON column records which
   source contributed what, when. We can always trace a data point back.

4. **Additive enrichment** — new sources never break existing data. The `sources`
   object is a namespace map; adding a new source is just adding a new key.

5. **`updated_at` is the sync cursor** — every mutation advances `updated_at`.
   Client sync is a single query: `WHERE updated_at > ?`.

6. **Server is authoritative** — clients never write entries back to server.
   Conflict resolution is unnecessary; server always wins.

---

## 2. Server SQLite Schema

### 2.1 `entries` — Core Dictionary Table

```sql
CREATE TABLE entries (
    -- Identity
    id              TEXT PRIMARY KEY,       -- "Haus|NOUN" (lemma|UPOS)
    lemma           TEXT NOT NULL,          -- "Haus"
    pos             TEXT NOT NULL DEFAULT '',-- UPOS: NOUN, VERB, ADJ, ADV, ADP, CONJ, DET, NUM, PRON, INTJ, PART, X

    -- Core linguistic data
    gender          TEXT,                   -- "m", "f", "n" (nouns only)
    ipa             TEXT,                   -- "/haʊ̯s/"
    audio_url       TEXT,                   -- Wikimedia audio URL
    syllabification TEXT,                   -- "Haus" / "Häu·ser"
    etymology       TEXT,                   -- Free-text etymology

    -- Translations & definitions (JSON arrays)
    translations    TEXT NOT NULL DEFAULT '[]',  -- ["house", "home", "building"]
    definitions_de  TEXT NOT NULL DEFAULT '[]',  -- [{"nr":"1","text":"Gebäude...","labels":["übertragen"]}]
    senses          TEXT NOT NULL DEFAULT '[]',  -- [{glosses:[...], tags:[...], examples:[...], domain:"..."}]
    examples        TEXT NOT NULL DEFAULT '[]',  -- [{de:"...", en:"..."}, ...]

    -- Morphology (JSON)
    inflections     TEXT,                   -- [{form:"Häuser", tags:["nominative","plural"]}]

    -- Semantic relations (JSON)
    synonyms        TEXT NOT NULL DEFAULT '[]',  -- ["Gebäude", "Bau", "Heim"]
    antonyms        TEXT NOT NULL DEFAULT '[]',  -- []
    hypernyms       TEXT NOT NULL DEFAULT '[]',  -- ["Gebäude", "Bauwerk"]
    hyponyms        TEXT NOT NULL DEFAULT '[]',  -- ["Einfamilienhaus", "Mehrfamilienhaus"]
    derived         TEXT NOT NULL DEFAULT '[]',  -- ["häuslich", "Haushalt", "Rathaus"]
    related         TEXT NOT NULL DEFAULT '[]',  -- ["Gehäuse", "hausen"]
    collocations    TEXT NOT NULL DEFAULT '[]',  -- ["ein Haus bauen", "zu Hause"]

    -- Corpus & frequency
    corpus_examples TEXT NOT NULL DEFAULT '[]',  -- [{sentence:"...", source:"...", date:"...", genre:"..."}]
    frequency_class INTEGER,                     -- DWDS 1-7 (1=most common, 7=rare)
    frequency_per_m REAL,                        -- Frequency per million tokens
    frequency_ts    TEXT,                         -- JSON: [{year:1900, f:180.2}, ...]
    cefr_level      TEXT,                         -- "A1", "A2", "B1", "B2", "C1", "C2"

    -- Metadata
    rhymes          TEXT,                   -- "-aʊ̯s"
    homophones      TEXT,                   -- JSON: ["Haus"]
    proverbs        TEXT,                   -- JSON: ["Wer im Glashaus sitzt..."]
    wikidata_id     TEXT,                   -- "Q3947"
    wikipedia       TEXT,                   -- "Haus"
    compound_parts  TEXT,                   -- JSON: literal_meaning / wortbildung
    case_government TEXT,                   -- For verbs: "jmdn. etw. fragen"
    auxiliary       TEXT,                   -- "sein" or "haben" (for verbs)
    verb_class      TEXT,                   -- "strong/7", "weak", "irregular"
    usage_labels    TEXT NOT NULL DEFAULT '[]',  -- ["umgangssprachlich", "gehoben", "veraltend"]
    subject_domains TEXT NOT NULL DEFAULT '[]',  -- ["architecture", "politics"]

    -- Source tracking (JSON object, additive)
    sources         TEXT NOT NULL DEFAULT '{}',  -- {"freedict":{...}, "kaikki":{...}, "dwds":{...}}

    -- Sync
    created_at      INTEGER NOT NULL,       -- Unix ms
    updated_at      INTEGER NOT NULL        -- Unix ms — client syncs on this
);

-- Indexes for common queries
CREATE INDEX idx_entries_lemma       ON entries(lemma);
CREATE INDEX idx_entries_pos         ON entries(pos);
CREATE INDEX idx_entries_updated_at  ON entries(updated_at);
CREATE INDEX idx_entries_cefr        ON entries(cefr_level);
CREATE INDEX idx_entries_freq_class  ON entries(frequency_class);
```

### 2.2 `entries_fts` — Full-Text Search (server-side only)

```sql
-- FTS5 for reverse search (English → German) and fuzzy queries
CREATE VIRTUAL TABLE entries_fts USING fts5(
    lemma,
    translations,       -- FTS can search within JSON strings
    synonyms,
    tokenize='unicode61 remove_diacritics 2'
);

-- Keep FTS in sync with triggers
CREATE TRIGGER entries_fts_ai AFTER INSERT ON entries BEGIN
    INSERT INTO entries_fts(rowid, lemma, translations, synonyms)
    VALUES (new.rowid, new.lemma, new.translations, new.synonyms);
END;

CREATE TRIGGER entries_fts_au AFTER UPDATE ON entries BEGIN
    UPDATE entries_fts
    SET lemma = new.lemma, translations = new.translations, synonyms = new.synonyms
    WHERE rowid = old.rowid;
END;

CREATE TRIGGER entries_fts_ad AFTER DELETE ON entries BEGIN
    DELETE FROM entries_fts WHERE rowid = old.rowid;
END;
```

### 2.3 `forms` — Inflected Form → Lemma Index

```sql
-- Maps every inflected form to its lemma entry
-- Built from Kaikki bulk data + UniMorph at build time
-- Essential for: user types "Häusern" → find "Haus|NOUN"
CREATE TABLE forms (
    form        TEXT NOT NULL,           -- "Häusern"
    entry_id    TEXT NOT NULL,           -- "Haus|NOUN"
    tags        TEXT,                    -- '["dative","plural"]'
    source      TEXT DEFAULT 'kaikki',   -- "kaikki" or "unimorph"
    PRIMARY KEY (form, entry_id)
);

CREATE INDEX idx_forms_form ON forms(form);
```

### 2.4 `sync_meta` — Sync Bookkeeping

```sql
CREATE TABLE sync_meta (
    key     TEXT PRIMARY KEY,
    value   TEXT
);

-- Example rows:
-- ('build_version', '2026-03-07')
-- ('kaikki_version', '2026-01')
-- ('last_dwds_batch', '1741700000000')
```

---

## 3. Client IndexedDB Schema

### Dexie v5 Schema

```js
const db = new Dexie('urwort');

db.version(5).stores({
    // ── Synced dictionary data ────────────────────────────
    entries: 'id, lemma, pos, gender, cefr_level, updated_at',

    // ── Form → lemma reverse index ───────────────────────
    forms: '[form+entry_id], form',

    // ── User data (local only, never synced) ─────────────
    history:   '++id, lemma, ts',
    bookmarks: 'entry_id, saved_at',

    // ── Sync metadata ────────────────────────────────────
    meta: 'key'
    // Stores: {key: 'last_sync_ts', value: 1741600000000}
    //         {key: 'sync_version', value: '2026-03-07'}
});
```

### Client Entry Shape

The client stores the **same JSON structure** as the server row, minus FTS-only
fields. Every field from the server `entries` table is stored as-is in
the IndexedDB `entries` store. This keeps sync trivial — just `bulkPut()`.

```js
// Client entry object (matches server row exactly)
{
    id: "Haus|NOUN",
    lemma: "Haus",
    pos: "NOUN",
    gender: "n",
    ipa: "/haʊ̯s/",
    audio_url: "https://upload.wikimedia.org/...",
    syllabification: "Haus",
    etymology: "From Middle High German hūs...",
    translations: ["house", "home", "building", "household"],
    definitions_de: [
        {nr: "1", text: "Gebäude, das Menschen als Wohnung dient"},
        {nr: "2", text: "Hausbewohner, Haushalt", labels: ["übertragen"]}
    ],
    senses: [
        {glosses: ["house", "home"], tags: [], domain: "architecture",
         examples: [{de: "Wir haben ein Haus gekauft.", en: "We bought a house."}]},
        {glosses: ["(politics) house, parliament"], tags: ["politics"]}
    ],
    examples: [
        {de: "Das Haus ist groß.", en: "The house is big."}
    ],
    inflections: [
        {form: "Haus",    tags: ["nominative", "singular"]},
        {form: "Hauses",  tags: ["genitive", "singular"]},
        {form: "Häuser",  tags: ["nominative", "plural"]},
        {form: "Häusern", tags: ["dative", "plural"]}
    ],
    synonyms: ["Gebäude", "Bau", "Heim", "Domizil"],
    antonyms: [],
    hypernyms: ["Gebäude", "Bauwerk"],
    hyponyms: ["Einfamilienhaus", "Mehrfamilienhaus"],
    derived: ["häuslich", "Haushalt", "Rathaus", "Krankenhaus"],
    related: ["Gehäuse", "hausen"],
    collocations: ["ein Haus bauen", "zu Hause", "Haus und Hof"],
    corpus_examples: [
        {sentence: "Die Regierung hat das Haus erworben.",
         source: "Berliner Zeitung", date: "2003-05-15", genre: "Zeitung"}
    ],
    frequency_class: 5,
    frequency_per_m: 245.3,
    cefr_level: "A1",
    frequency_ts: [{year: 1900, f: 180.2}, {year: 2000, f: 245.3}],
    rhymes: "-aʊ̯s",
    homophones: [],
    proverbs: ["Wer im Glashaus sitzt, soll nicht mit Steinen werfen"],
    wikidata_id: "Q3947",
    wikipedia: "Haus",
    compound_parts: null,
    case_government: null,
    auxiliary: null,
    verb_class: null,
    usage_labels: [],
    subject_domains: ["architecture"],
    sources: {
        freedict:       {extracted_at: 1741600000000, senses: 3},
        kaikki:         {extracted_at: 1741600000000, version: "2026-01"},
        dwds_snippet:   {fetched_at: 1741700000000},
        dwds_corpus:    {fetched_at: 1741700000000, kern_hits: 50000},
        dwds_profile:   {fetched_at: 1741700000000},
        openthesaurus:  {fetched_at: 1741700000000},
        unimorph:       {imported_at: 1741600000000}
    },
    updated_at: 1741700000000
}
```

---

## 4. Canonical Entry Example

### Noun: "Haus"

See the full entry shape in section 3 above (Client Entry Shape).

### Verb: "laufen"

```json
{
    "id": "laufen|VERB",
    "lemma": "laufen",
    "pos": "VERB",
    "gender": null,
    "ipa": "/ˈlaʊ̯fən/",
    "audio_url": "https://upload.wikimedia.org/.../De-laufen.ogg.mp3",
    "syllabification": "lau·fen",
    "etymology": "From Middle High German loufen, from Old High German hloufan, from Proto-Germanic *hlaupaną",

    "translations": ["to walk", "to run", "to be running", "to work (of a machine)"],
    "definitions_de": [
        {"nr": "1", "text": "sich aufrecht auf den Füßen mit einer Geschwindigkeit fortbewegen, bei der sich jeweils ein Fuß am Boden befindet"},
        {"nr": "2", "text": "sich schnell auf den Füßen fortbewegen", "labels": ["umgangssprachlich"]},
        {"nr": "3", "text": "in Gang, in Betrieb sein", "labels": ["übertragen"]}
    ],
    "senses": [
        {"glosses": ["to walk", "to go on foot"], "tags": ["intransitive"],
         "examples": [{"de": "Ich laufe jeden Tag zur Arbeit.", "en": "I walk to work every day."}]},
        {"glosses": ["to run"], "tags": ["intransitive", "colloquial"],
         "examples": [{"de": "Er lief so schnell er konnte.", "en": "He ran as fast as he could."}]},
        {"glosses": ["to be on", "to be running"], "tags": ["intransitive", "figurative"],
         "examples": [{"de": "Der Motor läuft.", "en": "The engine is running."}]}
    ],
    "examples": [
        {"de": "Das Kind lernt laufen.", "en": "The child is learning to walk."}
    ],

    "inflections": [
        {"form": "laufe",    "tags": ["first-person", "singular", "present", "indicative"]},
        {"form": "läufst",   "tags": ["second-person", "singular", "present", "indicative"]},
        {"form": "läuft",    "tags": ["third-person", "singular", "present", "indicative"]},
        {"form": "laufen",   "tags": ["first-person", "plural", "present", "indicative"]},
        {"form": "lauft",    "tags": ["second-person", "plural", "present", "indicative"]},
        {"form": "laufen",   "tags": ["third-person", "plural", "present", "indicative"]},
        {"form": "lief",     "tags": ["first-person", "singular", "past", "indicative"]},
        {"form": "liefst",   "tags": ["second-person", "singular", "past", "indicative"]},
        {"form": "gelaufen", "tags": ["past", "participle"]},
        {"form": "laufend",  "tags": ["present", "participle"]},
        {"form": "lauf",     "tags": ["imperative", "singular"]},
        {"form": "lauft",    "tags": ["imperative", "plural"]},
        {"form": "liefe",    "tags": ["first-person", "singular", "subjunctive-ii"]}
    ],

    "synonyms": ["gehen", "rennen", "funktionieren"],
    "antonyms": ["stehen", "stoppen"],
    "hypernyms": ["sich fortbewegen"],
    "hyponyms": ["joggen", "sprinten", "schlendern"],
    "derived": ["ablaufen", "anlaufen", "auslaufen", "durchlaufen", "Lauf", "Läufer", "Laufbahn"],
    "related": ["Lauf", "Läufer", "laufend"],
    "collocations": ["Gefahr laufen", "Amok laufen", "aus dem Ruder laufen"],

    "corpus_examples": [
        {"sentence": "Die Verhandlungen laufen bereits seit drei Monaten.",
         "source": "Die Zeit", "date": "2021-06-12", "genre": "Zeitung"}
    ],

    "frequency_class": 3,
    "frequency_per_m": 412.7,
    "cefr_level": "A1",

    "case_government": "intransitiv; mit Dativ: jmdm. über den Weg laufen",
    "auxiliary": "sein",
    "verb_class": "strong/7",
    "usage_labels": [],
    "subject_domains": [],

    "sources": {
        "freedict": {"extracted_at": 1741600000000, "senses": 5},
        "kaikki": {"extracted_at": 1741600000000},
        "dwds_snippet": {"fetched_at": 1741700000000},
        "unimorph": {"imported_at": 1741600000000}
    },
    "updated_at": 1741700000000
}
```

### Adjective: "schön"

```json
{
    "id": "schön|ADJ",
    "lemma": "schön",
    "pos": "ADJ",
    "gender": null,
    "ipa": "/ʃøːn/",
    "translations": ["beautiful", "nice", "lovely", "fine", "pretty"],
    "inflections": [
        {"form": "schön",     "tags": ["positive", "predicative"]},
        {"form": "schöner",   "tags": ["comparative"]},
        {"form": "schönsten", "tags": ["superlative"]},
        {"form": "schöner",   "tags": ["positive", "strong", "nominative", "masculine", "singular"]},
        {"form": "schöne",    "tags": ["positive", "strong", "nominative", "feminine", "singular"]},
        {"form": "schönes",   "tags": ["positive", "strong", "nominative", "neuter", "singular"]},
        {"form": "schönen",   "tags": ["positive", "weak", "nominative", "masculine", "singular"]}
    ],
    "synonyms": ["hübsch", "attraktiv", "ansprechend", "wunderschön"],
    "antonyms": ["hässlich", "unschön"],
    "cefr_level": "A1",
    "updated_at": 1741700000000
}
```

---

## 5. POS Tag Mapping

We normalize all POS tags to UPOS (Universal Dependencies POS tags):

| UPOS Tag | Description | FreeDict maps from | Kaikki maps from | DWDS maps from |
|----------|-------------|-------------------|-----------------|----------------|
| `NOUN` | Noun | "noun" | "noun" | "Substantiv" |
| `VERB` | Verb | "verb" | "verb" | "Verb" |
| `ADJ` | Adjective | "adjective" | "adj" | "Adjektiv" |
| `ADV` | Adverb | "adverb" | "adv" | "Adverb" |
| `ADP` | Adposition (preposition) | "preposition" | "prep" | "Präposition" |
| `CONJ` | Conjunction | "conjunction" | "conj" | "Konjunktion" |
| `DET` | Determiner | "article" | "det" | "Artikel" |
| `NUM` | Numeral | — | "num" | "Numerale" |
| `PRON` | Pronoun | "pronoun" | "pron" | "Pronomen" |
| `INTJ` | Interjection | — | "intj" | "Interjektion" |
| `PART` | Particle | — | "particle" | "Partikel" |
| `X` | Other | — | "affix", "phrase" | — |

---

## 6. Gender Normalization

All gender values are normalized to single lowercase letters:

| Canonical | DWDS `genus` | Kaikki `head_templates` | FreeDict regex |
|-----------|-------------|------------------------|----------------|
| `m` | "Maskulinum" | `args.1 == "m"` | "masculine", "male" |
| `f` | "Femininum" | `args.1 == "f"` | "feminine", "female" |
| `n` | "Neutrum" | `args.1 == "n"` | "neuter" |
| `null` | (not a noun) | (not present) | (not detected) |

---

## 7. Sync Protocol

### Overview

```
Client                                    Server
  │                                          │
  │  GET /api/sync?since=0&limit=500         │  ← Initial sync
  │ ────────────────────────────────────►     │
  │                                          │
  │  {entries: [...], forms: [...],           │
  │   next_cursor: TS, has_more: true}       │
  │  ◄────────────────────────────────────   │
  │                                          │
  │  bulkPut(entries); bulkPut(forms)        │
  │  meta.put({key:'last_sync_ts', value:TS})│
  │                                          │
  │  ... page until has_more = false ...     │
  │                                          │
  │  ══════ Later (incremental) ══════       │
  │                                          │
  │  GET /api/sync?since=TS&limit=500        │  ← Delta sync
  │ ────────────────────────────────────►     │
  │                                          │
  │  {entries: [3 updated], forms: [...],    │
  │   next_cursor: TS2, has_more: false}     │
  │  ◄────────────────────────────────────   │
```

### API Contract

```
GET /api/sync?since={unix_ms}&limit={n}&include_forms={bool}

Response:
{
    "entries":     [...],      // Array of entry objects (same shape as SQLite rows)
    "forms":       [...],      // Array of form→entry_id mappings
    "next_cursor": 1741700000000,  // Timestamp of last entry in this page
    "has_more":    false       // Whether more pages exist
}
```

### Properties

- **Idempotent**: Re-requesting same `since` is safe (`bulkPut` = upsert)
- **Resumable**: On connection drop, client retries from `last_sync_ts`
- **Paginated**: 500 entries/page, ~150KB/page, ~30 pages for full initial sync
- **Incremental**: After initial sync, daily deltas are tiny (only newly enriched entries)
- **One-directional**: Server → client only. Client never writes entries back.
- **User data stays local**: History, bookmarks never leave the device.

---

*Last updated: 2026-03-07*
*Reference for: database implementation, API development, client sync module*
