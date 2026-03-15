-- urwort SQLite schema
-- Applied by tools/build-db.py at build time.
-- See docs/canonical-schema.md for full field documentation.

PRAGMA journal_mode = WAL;
PRAGMA synchronous  = NORMAL;
PRAGMA foreign_keys = ON;

-- ── Main dictionary table ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS entries (
    -- Identity
    id              TEXT PRIMARY KEY,           -- "{lemma}|{UPOS}" e.g. "Haus|NOUN"
    lemma           TEXT NOT NULL,
    pos             TEXT NOT NULL DEFAULT '',   -- UPOS: NOUN VERB ADJ ADV ADP CONJ DET NUM PRON INTJ PART X

    -- Core phonetic / orthographic
    gender          TEXT,                       -- "m" "f" "n"
    ipa             TEXT,
    audio_url       TEXT,
    syllabification TEXT,

    -- Etymology
    etymology       TEXT,

    -- Translations & definitions (JSON arrays / objects)
    translations    TEXT NOT NULL DEFAULT '[]', -- ["house","home"]
    definitions_de  TEXT NOT NULL DEFAULT '[]', -- [{nr,text,labels:[]}]
    senses          TEXT NOT NULL DEFAULT '[]', -- [{glosses,tags,examples,domain}]
    examples        TEXT NOT NULL DEFAULT '[]', -- [{de,en}]

    -- Morphology
    inflections     TEXT NOT NULL DEFAULT '[]', -- [{form,tags:[]}]

    -- Semantic relations
    synonyms        TEXT NOT NULL DEFAULT '[]',
    antonyms        TEXT NOT NULL DEFAULT '[]',
    hypernyms       TEXT NOT NULL DEFAULT '[]',
    hyponyms        TEXT NOT NULL DEFAULT '[]',
    derived         TEXT NOT NULL DEFAULT '[]',
    related         TEXT NOT NULL DEFAULT '[]',
    collocations    TEXT NOT NULL DEFAULT '[]',

    -- Corpus & frequency
    corpus_examples TEXT NOT NULL DEFAULT '[]', -- [{sentence,source,date,genre}]
    frequency_class INTEGER,                    -- DWDS 1-7 (1=most common)
    frequency_per_m REAL,                       -- per million tokens
    frequency_ts    TEXT,                       -- [{year,f}]
    cefr_level      TEXT,                       -- A1 A2 B1 B2 C1 C2

    -- Extra
    rhymes          TEXT,
    homophones      TEXT NOT NULL DEFAULT '[]',
    proverbs        TEXT NOT NULL DEFAULT '[]',
    wikidata_id     TEXT,
    wikipedia       TEXT,
    compound_parts  TEXT,
    case_government TEXT,
    auxiliary       TEXT,                       -- "sein" "haben" (verbs)
    verb_class      TEXT,                       -- "strong/7" "weak" "irregular"
    usage_labels    TEXT NOT NULL DEFAULT '[]',
    subject_domains TEXT NOT NULL DEFAULT '[]',

    -- Source provenance (additive JSON object)
    sources         TEXT NOT NULL DEFAULT '{}',

    -- Sync cursor
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_entries_lemma      ON entries(lemma);
CREATE INDEX IF NOT EXISTS idx_entries_pos        ON entries(pos);
CREATE INDEX IF NOT EXISTS idx_entries_updated_at ON entries(updated_at);
CREATE INDEX IF NOT EXISTS idx_entries_cefr       ON entries(cefr_level);
CREATE INDEX IF NOT EXISTS idx_entries_freq_class ON entries(frequency_class);

-- ── Inflected form → lemma reverse index ───────────────────────────────────

CREATE TABLE IF NOT EXISTS forms (
    form        TEXT NOT NULL,
    entry_id    TEXT NOT NULL,
    tags        TEXT,           -- JSON: ["dative","plural"]
    source      TEXT DEFAULT 'kaikki',
    PRIMARY KEY (form, entry_id)
);

CREATE INDEX IF NOT EXISTS idx_forms_form ON forms(form);

-- ── Full-text search ────────────────────────────────────────────────────────

CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
    lemma,
    translations,
    synonyms,
    content = 'entries',
    content_rowid = 'rowid',
    tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS entries_fts_ai AFTER INSERT ON entries BEGIN
    INSERT INTO entries_fts(rowid, lemma, translations, synonyms)
    VALUES (new.rowid, new.lemma, new.translations, new.synonyms);
END;

CREATE TRIGGER IF NOT EXISTS entries_fts_au AFTER UPDATE ON entries BEGIN
    INSERT INTO entries_fts(entries_fts, rowid, lemma, translations, synonyms)
    VALUES ('delete', old.rowid, old.lemma, old.translations, old.synonyms);
    INSERT INTO entries_fts(rowid, lemma, translations, synonyms)
    VALUES (new.rowid, new.lemma, new.translations, new.synonyms);
END;

CREATE TRIGGER IF NOT EXISTS entries_fts_ad AFTER DELETE ON entries BEGIN
    INSERT INTO entries_fts(entries_fts, rowid, lemma, translations, synonyms)
    VALUES ('delete', old.rowid, old.lemma, old.translations, old.synonyms);
END;

-- ── Build metadata ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT
);
