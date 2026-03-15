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


-- ══════════════════════════════════════════════════════════════════════════════
-- ONTOLOGY GRAPH TABLES
-- Coexist with entries/forms. Dictionary = data. Graph = structure.
-- Populated by tools/export-ontology.py (not build-db.py).
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Roots (Wurzeln) ──────────────────────────────────────────────────────────
-- A root morpheme at a specific historical stage.
-- Same root at different stages = separate rows linked by etymology_edges.

CREATE TABLE IF NOT EXISTS roots (
    id              TEXT PRIMARY KEY,       -- "nhg:steh", "gem-pro:*standaną", "ine-pro:*steh₂-"
    form            TEXT NOT NULL,
    stage           TEXT NOT NULL,          -- ine-pro, gem-pro, gmw-pro, goh, gmh, nhg, la, grc, fr
    core_meaning    TEXT,
    is_reconstructed INTEGER DEFAULT 0,
    morpheme_type   TEXT DEFAULT 'free',    -- free, bound
    sources         TEXT DEFAULT '{}',
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_roots_form  ON roots(form);
CREATE INDEX IF NOT EXISTS idx_roots_stage ON roots(stage);


-- ── Affixes ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS affixes (
    id              TEXT PRIMARY KEY,       -- "prefix:ver", "suffix:ung"
    form            TEXT NOT NULL,
    position        TEXT NOT NULL,          -- prefix, suffix, circumfix
    separable       INTEGER,               -- 1=separable, 0=inseparable (verbal prefixes only)
    semantic_functions TEXT DEFAULT '[]',   -- JSON array
    grammatical_effect TEXT,                -- JSON: {"changes_pos":"verb→noun","assigns_gender":"f"}
    productivity    TEXT DEFAULT 'productive',
    etymology_root_id TEXT,                 -- FK → roots.id (if affix has its own etymology)
    sources         TEXT DEFAULT '{}',
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,
    FOREIGN KEY (etymology_root_id) REFERENCES roots(id)
);

CREATE INDEX IF NOT EXISTS idx_affixes_form ON affixes(form);


-- ── Morphological decompositions ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS decompositions (
    entry_id            TEXT PRIMARY KEY,   -- FK → entries.id
    segments            TEXT NOT NULL,      -- JSON: [{"form":"ver","type":"prefix","ref":"prefix:ver"}, ...]
    word_formation_type TEXT,               -- prefixation, suffixation, composition, conversion, simplex
    is_compound         INTEGER DEFAULT 0,
    compound_parts      TEXT,               -- JSON: [{"entry_id":"Hand|NOUN","role":"determinans"}, ...]
    verified            INTEGER DEFAULT 0,
    sources             TEXT DEFAULT '{}',
    created_at          INTEGER NOT NULL,
    updated_at          INTEGER NOT NULL,
    FOREIGN KEY (entry_id) REFERENCES entries(id)
);


-- ══════════════════════════════════════════════════════════════════════════════
-- EDGE TABLES
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Etymology edges ──────────────────────────────────────────────────────────
-- Links roots across historical stages.
-- Direction: from (newer/descendant) → to (older/ancestor)

CREATE TABLE IF NOT EXISTS etymology_edges (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    from_root_id    TEXT NOT NULL,
    to_root_id      TEXT NOT NULL,
    edge_type       TEXT NOT NULL,          -- descends_from, borrowed_from, cognate_of
    sound_change    TEXT,
    borrowing_period TEXT,
    confidence      TEXT DEFAULT 'attested',
    sources         TEXT DEFAULT '{}',
    UNIQUE(from_root_id, to_root_id, edge_type),
    FOREIGN KEY (from_root_id) REFERENCES roots(id),
    FOREIGN KEY (to_root_id)   REFERENCES roots(id)
);

CREATE INDEX IF NOT EXISTS idx_etym_from ON etymology_edges(from_root_id);
CREATE INDEX IF NOT EXISTS idx_etym_to   ON etymology_edges(to_root_id);


-- ── Derivation edges ─────────────────────────────────────────────────────────
-- Links entries to their component roots and affixes.

CREATE TABLE IF NOT EXISTS derivation_edges (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id        TEXT NOT NULL,          -- FK → entries.id
    target_id       TEXT NOT NULL,          -- FK → roots.id OR affixes.id
    target_type     TEXT NOT NULL,          -- "root" or "affix"
    position        INTEGER,               -- 0-based order in the word
    sources         TEXT DEFAULT '{}',
    UNIQUE(entry_id, target_id, position),
    FOREIGN KEY (entry_id) REFERENCES entries(id)
);

CREATE INDEX IF NOT EXISTS idx_deriv_entry  ON derivation_edges(entry_id);
CREATE INDEX IF NOT EXISTS idx_deriv_target ON derivation_edges(target_id);


-- ── Compound edges ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS compound_edges (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    compound_entry_id   TEXT NOT NULL,
    component_entry_id  TEXT NOT NULL,
    role            TEXT,                   -- determinans, determinatum
    fugenelement    TEXT,                   -- "s", "n", "en", "er", ""
    position        INTEGER,
    sources         TEXT DEFAULT '{}',
    UNIQUE(compound_entry_id, component_entry_id),
    FOREIGN KEY (compound_entry_id)  REFERENCES entries(id),
    FOREIGN KEY (component_entry_id) REFERENCES entries(id)
);

CREATE INDEX IF NOT EXISTS idx_compound_compound  ON compound_edges(compound_entry_id);
CREATE INDEX IF NOT EXISTS idx_compound_component ON compound_edges(component_entry_id);


-- ── Semantic edges ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS semantic_edges (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    from_entry_id   TEXT NOT NULL,
    to_entry_id     TEXT NOT NULL,
    edge_type       TEXT NOT NULL,          -- synonym_of, antonym_of, hypernym_of, hyponym_of
    score           REAL,
    sources         TEXT DEFAULT '{}',
    UNIQUE(from_entry_id, to_entry_id, edge_type),
    FOREIGN KEY (from_entry_id) REFERENCES entries(id),
    FOREIGN KEY (to_entry_id)   REFERENCES entries(id)
);

CREATE INDEX IF NOT EXISTS idx_semantic_from ON semantic_edges(from_entry_id);
CREATE INDEX IF NOT EXISTS idx_semantic_to   ON semantic_edges(to_entry_id);


-- ── Semantic fields ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS semantic_fields (
    id              TEXT PRIMARY KEY,       -- "field:dwelling", "field:motion"
    name_de         TEXT,
    name_en         TEXT,
    parent_field_id TEXT,
    sources         TEXT DEFAULT '{}',
    FOREIGN KEY (parent_field_id) REFERENCES semantic_fields(id)
);

CREATE TABLE IF NOT EXISTS entry_fields (
    entry_id        TEXT NOT NULL,
    field_id        TEXT NOT NULL,
    PRIMARY KEY (entry_id, field_id),
    FOREIGN KEY (entry_id) REFERENCES entries(id),
    FOREIGN KEY (field_id) REFERENCES semantic_fields(id)
);

CREATE INDEX IF NOT EXISTS idx_entry_fields_field ON entry_fields(field_id);


-- ── Spatial layout (pre-computed positions for Phase 1) ──────────────────────

CREATE TABLE IF NOT EXISTS spatial_layout (
    root_id         TEXT PRIMARY KEY,       -- NHG root ID for the cluster
    x               REAL NOT NULL,
    z               REAL NOT NULL,
    island_radius   REAL,
    island_height   REAL,
    layout_version  INTEGER DEFAULT 1,
    FOREIGN KEY (root_id) REFERENCES roots(id)
);
