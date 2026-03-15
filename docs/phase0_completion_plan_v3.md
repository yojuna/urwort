# URWORT — Phase 0 Completion Plan (v3)

_Working reference for completing Phase 0 and preparing Phase 1._

_Supersedes: `phase0_completion_plan_updated.md` (March 15 v2)._

_Status: Weeks 1–2 COMPLETE. Week 3 (debt cleanup + graph schema + polish) REMAINING._

_Audience: Coding agent — all tasks are specified with file paths, interfaces, SQL, and acceptance criteria._

March 2026

---

## 0. Progress Summary

### Completed Work

| Sprint | Status | Key Outcomes |
|--------|--------|-------------|
| **Week 1: Data Enrichment** | ✅ COMPLETE | `export-ontology.py` rewritten: full etymology chains, morphological segments, source URLs, Kaikki glosses, etymology-text regex fallback |
| **Week 2: UI Features** | ✅ COMPLETE | Etymology timeline, colour-coded segment breakdown, fuzzy search with fly-to, source links on all cards |

### Current Data Stats

| Metric | Value |
|--------|-------|
| Total words | 1,351 |
| Total clusters | 1,138 |
| Multi-word clusters | 155 (368 words) |
| Words with etymology chain ≥2 stages | 759 |
| Words with morphological segments | 614 |
| Words with source URLs | 1,351 (100%) |
| Compound links | ~50 |

### Core Success Criteria: 9/9 ✅

All core success criteria (3D world, morphological decomposition, etymology chain, search, navigation, data, source citations, performance, Docker) are met. What remains is polish, code architecture, data quality, and — newly added — the graph-aware SQLite schema.

---

## 1. Week 3 Overview

Week 3 has five workstreams. The graph schema (1.2) is the most architecturally significant — it establishes the data foundation for Phase 1's force-directed layout, API endpoints, and richer cross-cluster queries. The other workstreams are independent and can be done in any order.

**Estimated total: 24–30 hours.**

```
Workstream 1: Code Architecture Refactor     (~5h)
Workstream 2: Graph-Aware SQLite Schema      (~6-8h)  ← NEW
Workstream 3: Rendering & Performance         (~4h)
Workstream 4: UX Polish                       (~4-5h)
Workstream 5: Pipeline Quality & Validation   (~4-5h)
```

---

## 1.1 Workstream 1: Code Architecture Refactor

**Goal:** Split `main.ts` (231 lines) into focused modules. Target: `main.ts` < 60 lines.

### Task A1: Extract InteractionManager

**File:** `game/src/entities/InteractionManager.ts` (new)

**What moves out of `main.ts`:**
- `pointerdown` / `pointerup` event handlers
- Tap distance threshold check (8px)
- Raycaster setup and intersection testing
- `userData` type checking (`word`, `island-*`)
- Card show/hide logic dispatch
- Escape key handler for card dismiss

**Interface:**

```typescript
import * as THREE from 'three';
import { WordCard } from '../ui/word-card';
import { CameraController } from '../player/camera';

export class InteractionManager {
  constructor(
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    scene: THREE.Scene,
    wordCard: WordCard,
    cameraCtrl: CameraController
  );

  /** Call each frame — updates hover state */
  update(): void;

  /** Remove all event listeners */
  dispose(): void;
}
```

**Acceptance criteria:**
- All pointer/tap/escape handling removed from `main.ts`
- `main.ts` calls only `interactionManager.update()` in the render loop
- Clicking words and islands works identically to current behaviour
- No new runtime dependencies

**Effort:** 2h

### Task A2: Create OntologyStore

**File:** `game/src/data/OntologyStore.ts` (new)

**What:** Centralise ontology data access. Currently raw JSON data is passed around as plain objects. This class indexes on load and exposes typed query methods.

**Interface:**

```typescript
import { OntologyData, RootCluster, Wort } from '../types';

export class OntologyStore {
  constructor(data: OntologyData);

  /** Prefix + fuzzy search, max 8 results. Handles umlaut transliteration. */
  searchLemma(query: string): Wort[];

  /** Lookup by cluster wurzel ID (e.g. "r-42") */
  getCluster(wurzelId: string): RootCluster | null;

  /** Lookup by wort ID (e.g. "Haus|NOUN") */
  getWort(wortId: string): Wort | null;

  /** Find which cluster contains a given wort */
  getClusterForWort(wortId: string): RootCluster | null;

  /** All clusters (for world generation) */
  allClusters(): RootCluster[];

  readonly totalWords: number;
  readonly totalClusters: number;
}
```

**Migration:**
- `SearchBar` currently maintains its own internal index — refactor to use `OntologyStore.searchLemma()`
- Any raw data walks in `main.ts` or `word-card.ts` go through `OntologyStore`

**Acceptance criteria:**
- Single source of truth for ontology data access
- `SearchBar` delegates search to `OntologyStore`
- No direct `ontologyData.clusters.find(...)` calls remain in other modules

**Effort:** 2h

### Task A3: Extract EntityFactory

**File:** `game/src/entities/EntityFactory.ts` (new)

**What:** Move mesh creation for islands, word pillars, and bridges into a factory. Prepares for POS-specific meshes (Task P2) and instanced rendering (Task R2).

**Interface:**

```typescript
import * as THREE from 'three';
import { Island, Bridge } from '../types/world';
import { Wort, Wurzel } from '../types/ontology';

export class EntityFactory {
  createIslandMesh(island: Island): THREE.Group;
  createWordPillar(wort: Wort, position: THREE.Vector3): THREE.Mesh;
  createRootMonument(wurzel: Wurzel): THREE.Mesh;
  createBridgeMesh(bridge: Bridge, islandMap: Map<string, Island>): THREE.Group;
}
```

**Effort:** 1h

### Task A4: Verify main.ts Slimmed

After A1–A3, `main.ts` should contain only orchestration:

```typescript
async function main() {
  const ctx = createSceneContext(container);                    // ~2 lines
  const cameraCtrl = new CameraController(...);                // ~3 lines
  const store = new OntologyStore(await loadOntology());       // ~2 lines
  const wordCard = new WordCard(container);                    // ~1 line
  const searchBar = new SearchBar(container, store, cameraCtrl); // ~1 line
  const interaction = new InteractionManager(...);              // ~1 line
  const layout = computeGridLayout(store.allClusters());       // ~1 line
  buildWorld(ctx.scene, layout);                               // ~3 lines
  function animate() { /* ~6 lines */ }
  animate();
}
```

**Acceptance criteria:** `main.ts` < 60 lines. All logic in dedicated modules.

---

## 1.2 Workstream 2: Graph-Aware SQLite Schema

**Goal:** Add ontology graph tables to `schema.sql` and populate them from `export-ontology.py`. This establishes the graph data foundation for Phase 1 (force-directed layout, API endpoints, cross-cluster queries) while keeping the existing dictionary tables (`entries`, `forms`, `entries_fts`) untouched.

**Design principle:** SQLite with recursive CTEs handles graph traversals up to ~30,000 nodes efficiently. No separate graph database needed until Phase 3+ (50,000+ nodes).

### Task G1: Add Graph Tables to schema.sql

**File:** `tools/schema.sql` — append the following after the existing `meta` table definition.

```sql
-- ══════════════════════════════════════════════════════════════
-- ONTOLOGY GRAPH TABLES
-- Coexist with entries/forms. Dictionary = data. Graph = structure.
-- ══════════════════════════════════════════════════════════════

-- ── Roots (Wurzeln) ──────────────────────────────────────────
-- A root morpheme at a specific historical stage.
-- Same root at different stages = separate rows linked by etymology_edges.

CREATE TABLE IF NOT EXISTS roots (
    id              TEXT PRIMARY KEY,       -- "nhg:steh", "pgmc:*standaną", "pie:*steh₂-"
    form            TEXT NOT NULL,
    stage           TEXT NOT NULL,          -- pie, pgmc, gmw_pro, ohg, mhg, nhg, latin, greek, french
    core_meaning    TEXT,
    is_reconstructed INTEGER DEFAULT 0,
    morpheme_type   TEXT DEFAULT 'free',    -- free, bound
    sources         TEXT DEFAULT '{}',
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_roots_form  ON roots(form);
CREATE INDEX IF NOT EXISTS idx_roots_stage ON roots(stage);


-- ── Affixes ──────────────────────────────────────────────────

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


-- ── Morphological decompositions ─────────────────────────────

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


-- ══════════════════════════════════════════════════════════════
-- EDGE TABLES
-- ══════════════════════════════════════════════════════════════

-- ── Etymology edges ──────────────────────────────────────────
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


-- ── Derivation edges ─────────────────────────────────────────
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


-- ── Compound edges ───────────────────────────────────────────

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


-- ── Semantic edges ───────────────────────────────────────────

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


-- ── Semantic fields ──────────────────────────────────────────

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


-- ── Spatial layout (pre-computed positions) ──────────────────

CREATE TABLE IF NOT EXISTS spatial_layout (
    root_id         TEXT PRIMARY KEY,       -- NHG root ID for the cluster
    x               REAL NOT NULL,
    z               REAL NOT NULL,
    island_radius   REAL,
    island_height   REAL,
    layout_version  INTEGER DEFAULT 1,
    FOREIGN KEY (root_id) REFERENCES roots(id)
);
```

**Acceptance criteria:**
- `build-db.py` applies the new schema without errors (all tables created)
- Existing `entries`, `forms`, `entries_fts`, `meta` tables are unchanged
- New tables are empty after `build-db.py` runs (populated by `export-ontology.py`)

**Effort:** 1h (add SQL + test `build-db.py` still works)

### Task G2: Populate Graph Tables in export-ontology.py

**File:** `tools/export-ontology.py` — add a new function `populate_graph_tables()` called after cluster building, before JSON export.

**What this function does:**

1. **Populates `roots` table** — For each cluster's wurzel and each stage in its `etymology_chain`, insert a root row. The NHG form of the root is one row; each historical stage (MHG, OHG, PGmc, PIE) from the chain is another row.

2. **Populates `etymology_edges` table** — For each consecutive pair of stages in an etymology chain, insert a `descends_from` edge from the newer stage to the older stage. For loanwords (where `borrowing_info` is present), insert a `borrowed_from` edge instead. For cognates, insert `cognate_of` edges.

3. **Populates `affixes` table** — Collect all unique prefixes and suffixes encountered in morphological segments across all words. Insert each as a row with its position (prefix/suffix), separability (for verbal prefixes), and semantic function hints from the known affix inventory.

4. **Populates `decompositions` table** — For each word that has `segments` data, insert a decomposition row with the segments JSON and inferred `word_formation_type`.

5. **Populates `derivation_edges` table** — For each segment in a word's decomposition, insert an edge from the word's `entry_id` to the corresponding root or affix ID, with position.

6. **Populates `compound_edges` table** — For each compound link that has resolved `component_wort_ids`, insert edges from the compound word to its components with position.

7. **Populates `semantic_edges` table** — Read `entries.synonyms`, `entries.antonyms`, `entries.hypernyms`, `entries.hyponyms` from the dictionary DB. For each relationship where BOTH the source and target exist as entries, insert an edge.

8. **Populates `semantic_fields` table** — Read `entries.subject_domains` from the dictionary DB. Create unique field entries, then link entries to fields via `entry_fields`.

**Implementation skeleton:**

```python
def populate_graph_tables(db_path: str, clusters: list[dict]) -> dict:
    """
    Write ontology graph to SQLite edge tables.
    Returns stats dict for logging.
    """
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = OFF")  # Bulk insert performance
    cur = conn.cursor()
    ts = now_ms()
    
    stats = {
        "roots": 0, "affixes": 0, "decompositions": 0,
        "etymology_edges": 0, "derivation_edges": 0,
        "compound_edges": 0, "semantic_edges": 0,
        "semantic_fields": 0, "entry_fields": 0,
    }
    
    # Clear previous graph data (idempotent rebuild)
    for table in ["roots", "affixes", "decompositions", "etymology_edges",
                   "derivation_edges", "compound_edges", "semantic_edges",
                   "semantic_fields", "entry_fields", "spatial_layout"]:
        cur.execute(f"DELETE FROM {table}")
    
    seen_roots = set()
    seen_affixes = set()
    
    for cluster in clusters:
        wurzel = cluster["wurzel"]
        chain = wurzel.get("etymology_chain", [])
        
        # ── 1. Roots from etymology chain ──
        prev_root_id = None
        for stage in chain:
            root_id = f"{stage['stage']}:{stage['form']}"
            if root_id not in seen_roots:
                cur.execute("""
                    INSERT OR IGNORE INTO roots 
                    (id, form, stage, core_meaning, is_reconstructed, sources, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, '{}', ?, ?)
                """, (root_id, stage["form"], stage["stage"],
                      wurzel.get("meaning_en", ""),
                      1 if stage.get("is_reconstructed") else 0, ts, ts))
                seen_roots.add(root_id)
                stats["roots"] += 1
            
            # ── 2. Etymology edge (newer → older) ──
            if prev_root_id and prev_root_id != root_id:
                borrowing = wurzel.get("borrowing_info")
                edge_type = "borrowed_from" if (borrowing and stage.get("stage") == borrowing.get("lang_code")) else "descends_from"
                cur.execute("""
                    INSERT OR IGNORE INTO etymology_edges
                    (from_root_id, to_root_id, edge_type, sources)
                    VALUES (?, ?, ?, '{}')
                """, (prev_root_id, root_id, edge_type))
                stats["etymology_edges"] += 1
            
            prev_root_id = root_id
        
        # ── Cognate edges ──
        nhg_root_id = f"nhg:{wurzel['form']}" if chain else None
        for cog in wurzel.get("cognates", []):
            cog_id = f"cog:{cog['language'].lower()}:{cog['form']}"
            if cog_id not in seen_roots:
                cur.execute("""
                    INSERT OR IGNORE INTO roots
                    (id, form, stage, core_meaning, is_reconstructed, sources, created_at, updated_at)
                    VALUES (?, ?, ?, '', 0, '{}', ?, ?)
                """, (cog_id, cog["form"], f"cog_{cog['language'].lower()}", ts, ts))
                seen_roots.add(cog_id)
            if nhg_root_id:
                cur.execute("""
                    INSERT OR IGNORE INTO etymology_edges
                    (from_root_id, to_root_id, edge_type, sources)
                    VALUES (?, ?, 'cognate_of', '{}')
                """, (nhg_root_id, cog_id))
        
        # ── 3-5. Decompositions + derivation edges + affixes ──
        for word in cluster["words"]:
            segments = word.get("segments", [])
            if not segments:
                continue
            
            # Infer word_formation_type
            types = [s["type"] for s in segments]
            if "prefix" in types and "suffix" in types:
                wf_type = "circumfixation" if len(segments) == 3 else "prefixation+suffixation"
            elif "prefix" in types:
                wf_type = "prefixation"
            elif "suffix" in types:
                wf_type = "suffixation"
            else:
                wf_type = "simplex"
            
            is_compound = 1 if any(c["compound_wort_id"] == word["id"] 
                                   for c in cluster.get("compounds", [])) else 0
            
            cur.execute("""
                INSERT OR IGNORE INTO decompositions
                (entry_id, segments, word_formation_type, is_compound, verified, sources, created_at, updated_at)
                VALUES (?, ?, ?, ?, 0, '{}', ?, ?)
            """, (word["id"], json.dumps(segments), wf_type, is_compound, ts, ts))
            stats["decompositions"] += 1
            
            for i, seg in enumerate(segments):
                if seg["type"] == "root":
                    target_id = f"nhg:{seg['form']}"
                    target_type = "root"
                elif seg["type"] in ("prefix", "suffix"):
                    target_id = f"{seg['type']}:{seg['form']}"
                    target_type = "affix"
                    # Ensure affix exists
                    if target_id not in seen_affixes:
                        separable = None
                        if seg["type"] == "prefix":
                            sep_list = ["ab","an","auf","aus","bei","durch","ein","mit",
                                       "nach","über","um","unter","vor","weg","zu","zurück"]
                            insep_list = ["be","emp","ent","er","ge","miss","ver","zer","hinter"]
                            if seg["form"] in sep_list:
                                separable = 1
                            elif seg["form"] in insep_list:
                                separable = 0
                        cur.execute("""
                            INSERT OR IGNORE INTO affixes
                            (id, form, position, separable, sources, created_at, updated_at)
                            VALUES (?, ?, ?, ?, '{}', ?, ?)
                        """, (target_id, seg["form"], seg["type"], separable, ts, ts))
                        seen_affixes.add(target_id)
                        stats["affixes"] += 1
                else:
                    continue
                
                cur.execute("""
                    INSERT OR IGNORE INTO derivation_edges
                    (entry_id, target_id, target_type, position, sources)
                    VALUES (?, ?, ?, ?, '{}')
                """, (word["id"], target_id, target_type, i))
                stats["derivation_edges"] += 1
        
        # ── 6. Compound edges ──
        for compound in cluster.get("compounds", []):
            for i, comp_id in enumerate(compound.get("component_wort_ids", [])):
                if comp_id:
                    cur.execute("""
                        INSERT OR IGNORE INTO compound_edges
                        (compound_entry_id, component_entry_id, position, sources)
                        VALUES (?, ?, ?, '{}')
                    """, (compound["compound_wort_id"], comp_id, i))
                    stats["compound_edges"] += 1
    
    # ── 7. Semantic edges (from entries table) ──
    # Build lookup of which lemmas exist as entries
    all_entry_ids = set()
    lemma_to_id = {}
    for row in conn.execute("SELECT id, lemma FROM entries"):
        all_entry_ids.add(row[0])
        lemma_to_id[row[1]] = row[0]
    
    for rel_type, column, edge_type in [
        ("synonyms", "synonyms", "synonym_of"),
        ("antonyms", "antonyms", "antonym_of"),
        ("hypernyms", "hypernyms", "hypernym_of"),
        ("hyponyms", "hyponyms", "hyponym_of"),
    ]:
        rows = conn.execute(f"SELECT id, {column} FROM entries WHERE json_array_length({column}) > 0").fetchall()
        for entry_id, json_str in rows:
            if entry_id not in all_entry_ids:
                continue
            try:
                related = json.loads(json_str)
            except (json.JSONDecodeError, TypeError):
                continue
            for lemma in related[:10]:  # cap to avoid explosion
                target_id = lemma_to_id.get(lemma)
                if target_id and target_id != entry_id:
                    cur.execute("""
                        INSERT OR IGNORE INTO semantic_edges
                        (from_entry_id, to_entry_id, edge_type, sources)
                        VALUES (?, ?, ?, '{}')
                    """, (entry_id, target_id, edge_type))
                    stats["semantic_edges"] += 1
    
    # ── 8. Semantic fields (from entries.subject_domains) ──
    seen_fields = set()
    rows = conn.execute("SELECT id, subject_domains FROM entries WHERE json_array_length(subject_domains) > 0").fetchall()
    for entry_id, json_str in rows:
        try:
            domains = json.loads(json_str)
        except (json.JSONDecodeError, TypeError):
            continue
        for domain in domains[:5]:
            field_id = f"field:{domain.lower().replace(' ', '_')}"
            if field_id not in seen_fields:
                cur.execute("""
                    INSERT OR IGNORE INTO semantic_fields (id, name_en, sources)
                    VALUES (?, ?, '{}')
                """, (field_id, domain))
                seen_fields.add(field_id)
                stats["semantic_fields"] += 1
            cur.execute("""
                INSERT OR IGNORE INTO entry_fields (entry_id, field_id)
                VALUES (?, ?)
            """, (entry_id, field_id))
            stats["entry_fields"] += 1
    
    conn.execute("PRAGMA foreign_keys = ON")
    conn.commit()
    conn.close()
    
    return stats
```

**Integration point:** Call `populate_graph_tables()` in `export-ontology.py`'s `main()` function, after `resolve_compound_links()` and before the JSON export:

```python
# In main():
clusters = build_root_clusters(vocab, etym_map)
clusters = resolve_compound_links(clusters)

# NEW: populate graph tables
graph_stats = populate_graph_tables(str(db_path), clusters)
print(f"\n[ontology] Graph tables populated:")
for table, count in graph_stats.items():
    print(f"  {table}: {count:,}")

# Existing: JSON export
output = { "version": 2, ... }
```

**Acceptance criteria:**
- `python3 tools/build-db.py && python3 tools/export-ontology.py` runs without errors
- All graph tables populated with data
- Existing `ontology.json` output unchanged (graph tables are a parallel representation)
- The following queries return results:

```sql
-- Verify etymology chains
SELECT r1.form, r1.stage, '→', r2.form, r2.stage 
FROM etymology_edges e 
JOIN roots r1 ON e.from_root_id = r1.id 
JOIN roots r2 ON e.to_root_id = r2.id 
LIMIT 10;

-- Verify derivation edges  
SELECT e.lemma, d.target_id, d.target_type, d.position
FROM derivation_edges d
JOIN entries e ON d.entry_id = e.id
LIMIT 10;

-- Verify recursive etymology traversal
WITH RECURSIVE chain AS (
    SELECT r.id, r.form, r.stage, 0 AS depth FROM roots r WHERE r.form = 'haus' AND r.stage = 'nhg'
    UNION ALL
    SELECT r.id, r.form, r.stage, c.depth + 1
    FROM chain c JOIN etymology_edges e ON e.from_root_id = c.id JOIN roots r ON e.to_root_id = r.id
    WHERE c.depth < 10
)
SELECT * FROM chain ORDER BY depth;

-- Verify semantic edges
SELECT e1.lemma, se.edge_type, e2.lemma
FROM semantic_edges se
JOIN entries e1 ON se.from_entry_id = e1.id
JOIN entries e2 ON se.to_entry_id = e2.id
LIMIT 10;

-- Verify "find all words sharing a root"
SELECT DISTINCT e.lemma
FROM derivation_edges d1
JOIN derivation_edges d2 ON d1.target_id = d2.target_id AND d1.target_type = 'root' AND d2.target_type = 'root'
JOIN entries e ON d2.entry_id = e.id
WHERE d1.entry_id = 'fahren|VERB' AND d2.entry_id != 'fahren|VERB';
```

**Effort:** 4-5h

### Task G3: Print Graph Stats

**File:** `tools/export-ontology.py` — extend the existing `validate_and_print_stats()` to also query and print graph table counts.

```python
def print_graph_stats(db_path: str):
    conn = sqlite3.connect(db_path)
    tables = ["roots", "affixes", "decompositions", "etymology_edges",
              "derivation_edges", "compound_edges", "semantic_edges",
              "semantic_fields", "entry_fields"]
    print("\n[graph] SQLite graph tables:")
    for t in tables:
        count = conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
        print(f"  {t}: {count:,}")
    conn.close()
```

**Effort:** 30min

---

## 1.3 Workstream 3: Rendering & Performance

### Task R1: Render-on-Demand

**File:** `game/src/main.ts` (or the render loop, wherever it lives after refactor)

**What:** Add a dirty flag. Only call `renderer.render()` when something changed.

```typescript
let needsRender = true;

// Mark dirty on: camera change, fly-to active, keyboard input, resize, card toggle
controls.addEventListener('change', () => { needsRender = true; });

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  const moved = cameraCtrl.update(keyboard, delta);
  if (moved) needsRender = true;
  
  if (needsRender) {
    renderer.render(scene, camera);
    needsRender = false;
  }
}
```

**Acceptance criteria:** GPU idle when scene is static (verify via Chrome DevTools Performance tab — no paint/composite activity when user is reading a card).

**Effort:** 1.5h

### Task R2: InstancedMesh for Word Pillars

**File:** `game/src/world/island.ts` or `entities/EntityFactory.ts`

**What:** Replace individual box meshes with `THREE.InstancedMesh`. One draw call per POS type instead of one per word.

**Caveat:** Raycasting against InstancedMesh returns `instanceId`. InteractionManager (Task A1) must map `instanceId` → `Wort` via a lookup array stored in `userData`.

**Effort:** 1.5h (depends on A1 being done first for clean interaction handling)

### Task R3: Bundle Size Audit

**File:** `game/src/**/*.ts` — check all Three.js imports

**What:** Ensure named imports (not `import * as THREE from 'three'`). Check `vite.config.ts` for tree-shaking settings. Run `npx vite-bundle-analyzer` or `npx vite build --report` to identify large chunks.

**Effort:** 1h

---

## 1.4 Workstream 4: UX Polish

### Task P1: Hover Effects

**What:** Scale-up (1.0→1.15) + emissive glow on hover. Cursor changes to pointer.

**File:** `entities/InteractionManager.ts` (after A1 extraction)

**Effort:** 1h

### Task P2: POS-Specific Meshes

**What:** Different geometry + colour per part of speech.

| POS | Geometry | Colour |
|-----|----------|--------|
| NOUN | `BoxGeometry(0.4, 1.5, 0.4)` | Warm stone #8B7355 |
| VERB | `OctahedronGeometry(0.4, 0)` | Warm red #C44536 |
| ADJ | `SphereGeometry(0.3, 5, 4)` | Teal #2A9D8F |
| ADV | `TetrahedronGeometry(0.3, 0)` | Cool grey #6C757D |

**File:** `entities/EntityFactory.ts` (after A3 extraction)

**Effort:** 1.5h

### Task P3: Terrain Variation (stretch)

**What:** Perlin noise displacement on ground plane + height-based vertex colours.

**Effort:** 2h (stretch goal — only if other tasks complete early)

### Task P4: Path Markers (stretch)

**What:** Instanced small spheres between root monument and word pillars.

**Effort:** 1h (stretch goal)

### Task P5: Segment Split Animation

**What:** CSS transition on word card segments: start merged, gap grows over 300ms.

**Effort:** 30min

---

## 1.5 Workstream 5: Pipeline Quality & Validation

### Task Q1: Schema Validation in Export

**File:** `tools/export-ontology.py`

**What:** Strict validation of output JSON before writing. Fail the build on errors.

Checks: unique wurzel IDs, unique wort IDs, all links reference valid IDs, source_urls present on all entries, no empty definitions.

**Effort:** 1h

### Task Q2: Verify json_patch Function

**File:** `tools/build-db.py` line ~839

**What:** The Kaikki upsert SQL references `json_patch(sources, excluded.sources)`. Verify this custom function is registered. If missing, source provenance merging is silently broken.

**Fix if missing:** Register the function before Kaikki import:

```python
def _json_patch(existing, new):
    """SQLite custom function: merge two JSON objects."""
    try:
        base = json.loads(existing) if existing else {}
        patch = json.loads(new) if new else {}
        base.update(patch)
        return json.dumps(base)
    except (json.JSONDecodeError, TypeError):
        return new or existing

conn.create_function("json_patch", 2, _json_patch)
```

**Effort:** 30min to verify, 1h to fix if broken

### Task Q3: Source Manifest

**File:** `tools/source-manifest.yaml` (new)

**What:** Record all raw data sources with URLs, versions, file paths, and licenses. Enables anyone to reproduce the build.

**Effort:** 30min

### Task Q4: Export-Side Cluster Filtering

**File:** `tools/export-ontology.py`

**What:** Add `--min-cluster-size` CLI flag (default 1). For production builds, use `--min-cluster-size 2` to exclude ~983 single-word clusters and save ~200KB.

**Effort:** 30min

### Task Q5: Data Quality Spot-Check

**What:** Randomly sample 50 words. Verify decomposition, etymology, definition, CEFR, source URLs against Wiktionary/DWDS. Pass: ≤5 errors.

**Effort:** 1.5h

---

## 2. Sprint Execution Order

Recommended order considering dependencies:

```
Phase 1: Architecture (A1 → A2 → A3 → A4)          ~5h
  ↓ unblocks R2 (instanced rendering needs InteractionManager)
  ↓ unblocks P1 (hover needs InteractionManager)
  ↓ unblocks P2 (POS meshes need EntityFactory)

Phase 2: Graph Schema (G1 → G2 → G3)                ~6h
  (can run in parallel with Phase 1 — different files)

Phase 3: Quick Wins (P1, P2, P5, R1)                 ~4.5h
  (after Phase 1 architecture is in place)

Phase 4: Performance (R2, R3)                         ~2.5h
  (after Phase 1 architecture is in place)

Phase 5: Pipeline Quality (Q1, Q2, Q3, Q4, Q5)       ~4h
  (can run in parallel with everything else)
```

**If parallelising between two people:**
- Person A: Phase 1 (architecture) → Phase 3 (UX) → Phase 4 (performance)
- Person B: Phase 2 (graph schema) → Phase 5 (pipeline quality)

**Calendar estimate:** 3-4 days at full focus, or 1 week at half-days.

---

## 3. Updated Definition of Done

Phase 0 is **complete** when ALL of these are true:

### Core (all met ✅)

- [x] 3D world with root islands and word-objects at 30+ fps on mobile
- [x] Morphological decomposition with colour-coded segments
- [x] Etymology chain timeline (NHG → ... → PIE)
- [x] Search bar with fuzzy matching and camera fly-to
- [x] Navigation feels like exploration
- [x] 1,300+ lexemes with definitions, etymology, decomposition
- [x] Source citations on every card
- [x] 60fps desktop, 30+ fps mobile, <3s load
- [x] Docker dev environment
- [x] GitHub Pages live deployment

### Polish & Architecture (Week 3)

- [ ] `main.ts` < 60 lines; InteractionManager, OntologyStore, EntityFactory extracted
- [ ] **Graph-aware SQLite:** roots, affixes, decompositions, etymology_edges, derivation_edges, compound_edges, semantic_edges, semantic_fields tables populated
- [ ] **Recursive etymology query** works: `WITH RECURSIVE chain AS (...)`
- [ ] **Cross-cluster semantic edges** populated from entries.synonyms/antonyms
- [ ] Data quality spot-check: 50 entries, ≤5 errors
- [ ] Hover effects on word objects
- [ ] POS-specific meshes (shape + colour per part of speech)
- [ ] Render-on-demand (dirty flag)
- [ ] Schema validation in export pipeline
- [ ] Source manifest (`tools/source-manifest.yaml`)

---

## 4. Phase 1 Readiness: What the Graph Tables Enable

Once the graph tables are populated, Phase 1 can immediately build on them:

### 4.1 Force-Directed Layout (reads graph tables)

```python
# In export-ontology.py or a new layout.py:
# Read edges from all edge tables → build adjacency with weights → run Fruchterman-Reingold
# Write positions to spatial_layout table → include in ontology.json
```

### 4.2 API Graph Traversal Endpoints

```python
@app.get("/api/ontology/family/{root_id}")
async def get_root_family(root_id: str):
    # Recursive CTE on etymology_edges → full chain
    # JOIN derivation_edges → all words using this root
    # JOIN compound_edges → cross-cluster connections
    
@app.get("/api/ontology/related/{entry_id}")
async def get_related(entry_id: str):
    # semantic_edges → synonyms, antonyms, hypernyms
    # Same semantic_fields → topically related words
```

### 4.3 Richer JSON Export

The `ontology.json` v3 can include:
- `semantic_neighbours` per cluster (from semantic_edges)
- `cross_cluster_bridges` (from semantic_edges between words in different clusters)
- Pre-computed `(x, z)` positions (from spatial_layout table)

### 4.4 Oracle AI Grounding

The graph tables provide structured context for the Oracle's RAG prompts:

```
Context for word "Verständigung":
- Root: steh-/stand- (PIE *steh₂- → PGmc *standaną → OHG stantan → MHG stān → NHG stehen)
- Decomposition: ver- (prefix, inseparable) + stand (root) + ig (suffix → ADJ) + ung (suffix → NOUN, f.)
- Semantic field: communication
- Related via root: verstehen, Verstand, Gegenstand, zuständig, Zustand
- Synonyms: Kommunikation, Einigung
```

---

## Appendix A: File Inventory After Week 3

```
game/src/
├── main.ts                      <60 lines  (orchestration only)
├── types/ontology.ts            ~70 lines
├── types/world.ts               ~30 lines
├── data/OntologyStore.ts        ~120 lines (NEW)
├── data/loader.ts               ~70 lines
├── data/mock.ts                 ~130 lines
├── scene/renderer.ts            ~85 lines
├── world/layout.ts              ~70 lines
├── world/island.ts              ~120 lines
├── world/bridge.ts              ~85 lines
├── player/camera.ts             ~150 lines
├── player/input.ts              ~65 lines
├── ui/word-card.ts              ~500 lines
├── ui/search-bar.ts             ~200 lines
├── entities/InteractionManager.ts ~150 lines (NEW)
├── entities/EntityFactory.ts     ~100 lines (NEW)
└── utils/                        (noise.ts planned for P3)

tools/
├── build-db.py                  ~1,100 lines
├── schema.sql                   ~250 lines  (EXTENDED with graph tables)
├── export-ontology.py           ~1,000 lines (EXTENDED with populate_graph_tables)
└── source-manifest.yaml         ~40 lines   (NEW)
```

---

## Appendix B: Changelog

| Date | Change |
|------|--------|
| 2026-03-15 | v1: Initial plan (Weeks 1-3 planned) |
| 2026-03-15 | v2: Weeks 1-2 completed. Spatial graph design section added. |
| 2026-03-15 | **v3: Graph-aware SQLite integrated as Week 3 Workstream 2.** Full SQL schema, population code, acceptance criteria, and verification queries specified. Previous "defer to Phase 1" decision reversed — graph tables added now to establish data foundation. Sprint order updated. Definition of Done updated with graph criteria. Phase 1 readiness section added showing what graph tables enable. |

---

_Last updated: 2026-03-15_
_Version: 3_
_Reference for: Phase 0 Week 3 sprint execution_
