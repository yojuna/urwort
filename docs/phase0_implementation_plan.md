**URWORT — Phase 0 Revised Implementation Plan**

_The single reference document for Phase 0 development._

_Supersedes: `phase0_spec.md` (original), `implementation_audit.md` (bridge analysis)._

_Incorporates all design decisions from game_design.md, ontology_spec.md, and user clarifications._

March 2026

---

# 0. Decision Log

All major design decisions for Phase 0, recorded with rationale.

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Use TypeScript (not vanilla JS) | Type safety at scale; catches ontology mismatches early |
| D2 | SQLite for Phase 0 (not Neo4j/graph DB) | Minimal infra; existing pipeline uses it; graph DB in Phase 1 |
| D3 | Docker dev container (not host install) | Reproducible environment; zero host system pollution |
| D4 | Keep existing data pipeline, extend it | 60-70% of data work already done; avoid rewriting parsers |
| D5 | Replace client entirely (new `game/` dir) | Dictionary UI has zero reusable components for 3D game |
| D6 | No audio in Phase 0 | Reduces scope; audio added in Phase 1-2 |
| D7 | No exercises/practice mechanics | Phase 0 is discovery-only; exercises are Phase 1 |
| D8 | No SRS / spaced repetition | Phase 0 proves exploration; SRS is Phase 1-2 |
| D9 | No PWA / service worker / offline | Phase 0 is a served static site; PWA is Phase 2 |
| D10 | Minimal ontology entities only | No SoundChange, no separate Kompositum, no computed scores |
| D11 | Force-directed layout (simple, tune later) | Good enough for prototype; grid fallback if needed |
| D12 | WASD/arrow + click-to-move + pan navigation | Hybrid model for exploration feel (see §6 for deep analysis) |
| D13 | Three.js direct (no react-three-fiber) | Maximum control, minimal abstraction for prototype |
| D14 | Accept "contemplative vs. game" tension | Both aspects implemented minimally; narrative resolution in Phase 1 |
| D15 | Compound bridges: text-based fallback | Keep pedagogical idea; 3D decomposition if time allows |
| D16 | Avoid inaccessible sources | Skip GermaNet, CELEX, COSMAS II; use open sources only |
| D17 | 500 lexemes (A1-A2 core) | Enough to prove concept; expand in Phase 1 |

---

# 1. What Phase 0 Proves

**One hypothesis:** Walking through a spatial representation of the German root-word ontology, tapping objects to discover morphological structure and etymological depth, is a compelling and educationally sound experience.

Phase 0 proves this or falsifies it. Everything that doesn't serve this hypothesis is deferred.

## 1.1 Success Criteria

Phase 0 is complete when ALL of the following are true:

1. **A user can open the app and see a 3D world** with word-objects placed in it, running at 30+ fps on a 2022 mid-range Android phone's Chrome.
2. **Tapping any word-object shows its morphological decomposition** with root highlighted, affixes colour-coded, and definition displayed.
3. **Tapping a root monument shows the etymological chain** from NHG back to the deepest recoverable ancestor (PGmc or PIE), with each stage labelled and sourced.
4. **The search bar works:** type "Haus", camera flies to the Haus word-object.
5. **Navigation feels like exploration**, not like browsing a diagram. The user moves through the world, not above it.
6. **All 500 lexemes are present** with correct morphological decomposition, at least one definition, and etymological chain data.
7. **Source citations are visible** on every word card and etymology view.
8. **Performance:** 60 fps desktop Chrome, 30+ fps mobile Chrome. Initial load < 3 seconds.
9. **Runs in Docker:** `docker compose up` and open browser. No host install needed.

## 1.2 Explicitly Out of Scope

- No WFC world generation. Force-directed + procedural terrain only.
- No biomes or terrain variation. One visual style.
- No exercises or practice mechanics. Discovery only.
- No SRS / spaced repetition. No collection mechanic.
- No audio. No pronunciation, no ambient.
- No PWA / offline / service worker.
- No user accounts or contributions.
- No attestation passages.
- No SoundChange entities. Sound changes stored as text on etymology stages.
- No separate Kompositum entity. Compounds are a decomposition type on Wort.
- No `productivity_score` or `root_value_score`. These require corpus infrastructure.
- No GermaNet, CELEX, or COSMAS II data.

---

# 2. What We Keep from the Existing Codebase

The current `main` branch contains a working dictionary app. We build on its data layer and replace its UI.

## 2.1 KEEP: Data Pipeline (`tools/`)

| File | What it does | Status |
|------|-------------|--------|
| `tools/build-db.py` | FreeDict + Kaikki + IPA-dict + CEFR → SQLite | **Keep & extend** |
| `tools/schema.sql` | Dictionary schema (entries, forms, FTS, meta) | **Keep & extend** |
| `tools/build-dict.py` | Static JSON dict builder | Keep (for legacy dict app) |

The Kaikki JSONL parser already extracts: lemma, POS, gender, IPA, etymology_text, senses, derived, related, inflections, examples, synonyms, antonyms, compound_parts, head_templates, audio_url, wikidata. We extend it to also extract `etymology_templates[]` — the structured etymology chain data that is the backbone of the Urwort ontology.

## 2.2 KEEP: Raw Data (`raw-data/`)

| Source | Path | What we have |
|--------|------|-------------|
| FreeDict DE↔EN | `raw-data/freedict/` | StarDict binary (44k headwords) |
| Kaikki German by POS | `raw-data/kaikki/*.jsonl` | Nouns, verbs, adjectives (structured Wiktionary) |
| IPA-dict | `raw-data/ipa-dict/de.tsv` | 130k IPA transcriptions |
| CEFR | `raw-data/cefr/de.tsv` | A1-C2 word level tags |

## 2.3 KEEP: API Server (`api/`)

| File | Status |
|------|--------|
| `api/main.py` | Keep; add ontology endpoints |
| `api/db.py` | Keep |
| `api/enrichment.py` | Keep (DWDS enrichment) |
| `api/config.py` | Keep |
| `api/models.py` | Keep; extend for ontology types |

The FastAPI server gets new endpoints for the game client (see §8.3).

## 2.4 KEEP: Infrastructure (`infra/`)

Docker Compose files, Dockerfiles, and nginx configs exist. We simplify to a single dev container for Phase 0.

## 2.5 REPLACE: Client (`src/`)

The `src/` directory contains the old dictionary PWA (vanilla JS, Dexie, service worker, search workers). **None of this is reused.** The game client lives in a new `game/` directory.

The `src/` directory remains in the repository as-is (the dictionary app can continue to work alongside the game), but receives no further development in Phase 0.

---

# 3. Repository Structure

```
extras/urwort/
├── game/                          # NEW — Phase 0 game client
│   ├── src/
│   │   ├── main.ts                # Entry point
│   │   ├── types/                 # TypeScript type definitions
│   │   │   └── ontology.ts        # Ontology data types
│   │   ├── data/
│   │   │   └── OntologyStore.ts   # Load, index, query ontology
│   │   ├── scene/
│   │   │   └── SceneManager.ts    # Renderer, camera, controls, lights, render loop
│   │   ├── world/
│   │   │   ├── WorldGenerator.ts  # Orchestrates world generation
│   │   │   ├── TerrainBuilder.ts  # Ground plane with Perlin noise
│   │   │   ├── LayoutEngine.ts    # Force-directed root placement
│   │   │   └── ObjectPlacer.ts    # Word objects + root monuments + paths
│   │   ├── entities/
│   │   │   ├── EntityFactory.ts   # Creates 3D meshes (word objects, monuments)
│   │   │   └── InteractionManager.ts  # Raycasting, hover, selection, card trigger
│   │   ├── player/
│   │   │   └── PlayerController.ts    # Movement, camera follow, input handling
│   │   ├── ui/
│   │   │   ├── WordCard.ts        # CSS2D word card overlay
│   │   │   ├── EtymologyView.ts   # Etymology chain display
│   │   │   └── SearchBar.ts       # HTML search with autocomplete
│   │   └── utils/
│   │       ├── noise.ts           # Perlin/simplex noise
│   │       └── helpers.ts         # Math, colour, hash utilities
│   ├── public/
│   │   ├── index.html
│   │   └── ontology.json          # Generated by pipeline (copied at build time)
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
│
├── tools/                         # EXISTING + EXTENDED
│   ├── build-db.py                # Existing: FreeDict + Kaikki + IPA + CEFR → SQLite
│   ├── schema.sql                 # Existing + new ontology tables
│   ├── build-dict.py              # Existing (legacy dict builder)
│   ├── extract-etymology.py       # NEW: Kaikki etymology_templates → roots + links
│   ├── decompose-morphology.py    # NEW: Automated morphological decomposition
│   ├── build-affixes.py           # NEW: Extract affix inventory
│   ├── select-vocabulary.py       # NEW: Select 500 A1-A2 lexemes
│   ├── export-ontology.py         # NEW: SQLite → ontology.json for game
│   └── validate-ontology.py       # NEW: Schema validation + integrity checks
│
├── api/                           # EXISTING + EXTENDED
│   ├── main.py                    # + ontology endpoints
│   ├── db.py
│   ├── enrichment.py
│   └── ...
│
├── raw-data/                      # EXISTING
│   ├── freedict/
│   ├── kaikki/
│   ├── ipa-dict/
│   └── cefr/
│
├── data/                          # Build outputs
│   ├── urwort.db                  # Existing dictionary DB + new ontology tables
│   └── ontology.json              # NEW: generated game data file
│
├── src/                           # EXISTING (legacy dictionary app, untouched)
│
├── infra/                         # EXISTING
│   └── docker/
│
├── docker-compose.yml             # NEW: simplified Phase 0 dev container
├── Dockerfile.dev                 # NEW: dev container definition
│
└── docs/                          # Specs
    ├── phase0_implementation_plan.md  # THIS DOCUMENT
    ├── game_design.md
    ├── ontology_spec.md
    ├── phase0_spec.md             # Original (superseded by this doc)
    ├── implementation_audit.md
    ├── knowledge_base.md
    └── legacy/
```

---

# 4. Development Environment

## 4.1 Docker Dev Container

A single `docker compose up` starts the complete development environment. No host system installation required except Docker.

**`docker-compose.yml`** (project root):

```yaml
services:
  dev:
    build:
      context: .
      dockerfile: Dockerfile.dev
    ports:
      - "5173:5173"    # Vite dev server
      - "8000:8000"    # FastAPI server
    volumes:
      - .:/app
      - node_modules:/app/game/node_modules
    working_dir: /app
    command: bash
    stdin_open: true
    tty: true

volumes:
  node_modules:
```

**`Dockerfile.dev`**:

```dockerfile
FROM node:22-bookworm

# Python for data pipeline + API
RUN apt-get update && apt-get install -y \
    python3 python3-pip python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Python dependencies
COPY api/requirements.txt /tmp/requirements.txt
RUN pip3 install --break-system-packages -r /tmp/requirements.txt

WORKDIR /app
```

## 4.2 Development Workflow

```bash
# Start the container
docker compose up -d dev
docker compose exec dev bash

# Inside the container:

# 1. Build/rebuild the data pipeline
python3 tools/build-db.py
python3 tools/extract-etymology.py
python3 tools/decompose-morphology.py
python3 tools/build-affixes.py
python3 tools/select-vocabulary.py
python3 tools/export-ontology.py
python3 tools/validate-ontology.py

# 2. Start the game dev server
cd game && npm install && npm run dev

# 3. Start the API server (if needed)
cd /app && uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload

# Open in host browser:
# Game:  http://localhost:5173
# API:   http://localhost:8000/api/health
```

---

# 5. Tech Stack

## 5.1 Game Client

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Language | TypeScript (ES2022+ target) | Type safety; ontology data has complex shapes; catch errors early |
| Build system | Vite 6.x | Fast HMR, native ESM, zero-config TS support, optimised production build |
| 3D engine | Three.js (r170+) | Industry standard web 3D; direct usage, no wrappers |
| UI overlay | HTML/CSS + Three.js CSS2DRenderer | Word cards as CSS2D objects anchored to 3D positions; search bar as plain HTML |
| Framework | None | No React, no Vue. Direct DOM + Three.js. Minimal abstraction for a prototype. |
| State management | Plain TypeScript classes | No Redux, no Zustand. OntologyStore + WorldState + PlayerState as plain objects. |

## 5.2 Runtime Dependencies (Minimal)

The game client has exactly **two** runtime npm dependencies:

1. **`three`** — Three.js core (~600KB minified). The 3D engine.
2. **`three/addons`** — OrbitControls, CSS2DRenderer. Bundled with Three.js.

No state management library. No UI framework. No animation library. Every additional dependency must justify itself.

## 5.3 Data Pipeline & API

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Pipeline language | Python 3.11+ | Existing pipeline is Python; standard library + minimal deps |
| Database | SQLite 3 (WAL mode) | Existing; lightweight; more than sufficient for 500 lexemes |
| API framework | FastAPI | Existing; async; auto-docs |
| API server | Uvicorn | Existing |

## 5.4 Infrastructure

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Dev environment | Docker Compose | Reproducible; isolated; one command |
| Node.js | 22 LTS | Current LTS; stable |
| Deployment (Phase 0) | Static files (GitHub Pages or similar) | Zero cost; game is fully client-side; ontology.json bundled |

---

# 6. Navigation Model — Deep Analysis

This section expands on the critical design choice of how the player moves through the 3D world. The navigation model directly determines whether Phase 0 "feels like exploring a world" or "feels like browsing a diagram."

## 6.1 The Problem

The original Phase 0 spec proposed **pan-to-navigate** (OrbitControls with pan as the movement mechanism). This is the Three.js demo default — you drag to pan the camera, scroll to zoom, right-drag to rotate. It works well for:

- 3D model viewers
- Data visualisation dashboards
- Interactive infographics

It does **not** work well for creating a sense of **presence** or **exploration**. The user is a floating eye above the world, not a being *in* the world. The fundamental issue: pan navigation gives you a god-view. Exploration requires a ground-level perspective.

## 6.2 Options Evaluated

| Option | Pros | Cons | Exploration Feel |
|--------|------|------|-----------------|
| **A. Pan-to-navigate (OrbitControls)** | Zero implementation cost; well-tested; works on mobile | God-view; feels like a map viewer; no sense of being "in" the world | Low — diagram viewer |
| **B. Click/tap-to-walk** | Strong exploration feel; intuitive on mobile; destination-driven | Requires pathfinding or simple lerp; need a visible player/cursor on ground | High — feels like a place |
| **C. WASD / arrow keys (desktop) + virtual joystick (mobile)** | First-person or close-third-person; maximum exploration feel; gamer-familiar | More complex input handling; virtual joysticks feel bad on mobile; not accessible | High — traditional game feel |
| **D. Hybrid: Click-to-walk + WASD + scroll-zoom** | Best of B & C; multiple input methods suit multiple users; progressive disclosure | More code; need to handle input conflicts | High — flexible |

## 6.3 Phase 0 Choice: Option D — Hybrid Navigation

We implement a **hybrid navigation model** that supports multiple input methods. This is more work than pure OrbitControls, but it directly determines whether the prototype proves or falsifies the core concept.

### Ground Rules

1. **The camera is always close to the ground.** Elevation angle locked between 25°–70° above horizontal. No bird's-eye / map view. The player sees the world from an over-the-shoulder perspective, not a satellite view.
2. **There is a visible "focus point" on the ground** (a subtle glowing circle or marker). This is where the camera looks at. This is "you."
3. **Movement always happens along the ground plane.** No flying. The camera follows the focus point.

### Input Methods (all active simultaneously)

| Input | Desktop | Mobile | What it does |
|-------|---------|--------|-------------|
| **Click/tap ground** | Left-click on terrain | Tap on terrain | Focus point smoothly moves to clicked position (lerp over 0.5–1s). Camera follows. This is the **primary exploration method.** |
| **Click/tap object** | Left-click on word-object or monument | Tap on object | Opens word card / etymology view. Camera slightly adjusts to frame the object. |
| **WASD / Arrow keys** | Keyboard | N/A | Continuous movement of focus point. Speed: ~8 world units/sec. Camera follows smoothly. |
| **Scroll wheel** | Mouse wheel | Pinch | Zoom in/out (distance from focus point to camera). Clamped: min 3, max 25 world units. |
| **Right-drag** | Right mouse button + drag | Two-finger drag | Rotate camera around focus point. Horizontal: full 360°. Vertical: 25°–70°. |
| **Virtual joystick** | N/A | On-screen thumb joystick (bottom-left) | Continuous movement, equivalent to WASD. Only shown on touch devices. Subtle, semi-transparent. |
| **Edge panning** | Move cursor to screen edge | N/A | Optional: subtle slow pan when cursor near viewport edge. Disabled by default, toggle in settings. |

### Camera Behaviour

```
Camera position = focusPoint + sphericalOffset
  where sphericalOffset = {
    radius: zoomLevel (3–25, default 12),
    phi: elevationAngle (25°–70°, default 50°),
    theta: rotationAngle (0°–360°, default 0°)
  }
```

When the focus point moves (via click-to-walk or WASD), the camera follows with smooth damping (lerp factor ~0.05 per frame). This creates a natural, slightly delayed camera that feels organic rather than rigidly attached.

### Why This Works for Phase 0

- **Click-to-walk gives purpose.** You see a distant root monument, you click it, you travel there. This is exploration, not browsing.
- **WASD gives agency.** Desktop users who want fine-grained control get it. Feels like a game.
- **Virtual joystick handles mobile.** Touch users get a familiar mobile game control without complex gesture disambiguation.
- **Zoom gives overview when needed.** Zooming out lets you survey the landscape, zooming in lets you inspect detail. But you're always tethered to a ground position — you can't zoom out to god-view.
- **Rotation gives immersion.** Looking around from your position on the ground creates spatial awareness.

### Implementation Complexity

This is more work than pure OrbitControls, but the implementation is straightforward:

- **PlayerController class** (~200 lines): manages focus point position, spherical camera offset, input listeners, lerp/damping.
- **Click-to-walk**: Raycast to ground plane → set target position → lerp focus point.
- **WASD**: Each frame, move focus point by velocity vector in camera-relative direction.
- **Virtual joystick**: Use a simple HTML overlay with touch event math. ~100 lines. Or use `nipplejs` (tiny library, 3KB).
- **Camera update**: Each frame, compute camera position from focus point + spherical offset. Apply damping.

Total: ~400 lines of TypeScript for the complete navigation system. Estimated implementation time: 4–6 hours.

### What We Explicitly Don't Do

- No avatar/character model. The "player" is an invisible point on the ground with a camera following it.
- No collision detection with objects. You can walk through word-objects and monuments. Collision adds nothing to the learning experience and adds significant complexity.
- No pathfinding. Click-to-walk uses straight-line lerp. If something is in the way, you pass through it.
- No walk animation or footstep effects. The camera glides smoothly to the target.

### Risk and Fallback

If the hybrid system proves too complex or has input conflicts, fall back to **Option B (click-to-walk only)**. This is a subset of Option D — we just disable WASD and the virtual joystick. Click-to-walk alone still provides the exploration feel.

---

# 7. Ontology Data Model (Phase 0 — Minimal)

## 7.1 Design Principles for Phase 0

- **Roots, affixes, and lexemes only.** Three entity types, not seven.
- **Etymology chains as JSON arrays on roots**, not a separate Etymon entity table. This avoids graph traversal complexity while preserving all the data.
- **No SoundChange entity.** Sound changes stored as text within etymology chain entries.
- **No separate Kompositum entity.** Compounds are handled as a `word_formation_type: "composition"` on the morphological decomposition, with `compound_parts` as a JSON field.
- **No computed scores.** No `productivity_score`, no `root_value_score`. These require corpus analysis infrastructure that doesn't exist yet.
- **Source provenance on everything.** Every data point has a source reference.

## 7.2 SQLite Schema Extensions

These tables are **added** to the existing `schema.sql` alongside the `entries`, `forms`, and `meta` tables. The existing dictionary continues to work.

```sql
-- ── Ontology: Root morphemes ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roots (
    id              TEXT PRIMARY KEY,   -- 'nhg:steh', 'pgmc:*standanan'
    form            TEXT NOT NULL,      -- 'steh-/stand-'
    stage           TEXT NOT NULL,      -- 'nhg', 'mhg', 'ohg', 'pgmc', 'pie', 'latin', 'greek', 'french'
    core_meaning    TEXT,               -- 'to stand'
    is_reconstructed INTEGER DEFAULT 0, -- 1 for PIE/PGmc reconstructions
    allomorphs      TEXT DEFAULT '[]',  -- JSON: ["steh","stand","stünd","stund"]
    cognates        TEXT DEFAULT '[]',  -- JSON: [{"lang":"en","form":"stand"}, ...]
    etymology_chain TEXT DEFAULT '[]',  -- JSON: [{stage,form,meaning,source,is_reconstructed}, ...]
    sources         TEXT DEFAULT '{}',  -- JSON source provenance
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_roots_stage ON roots(stage);

-- ── Ontology: Affixes ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS affixes (
    id                  TEXT PRIMARY KEY,   -- 'prefix:ver', 'suffix:ung'
    form                TEXT NOT NULL,      -- 'ver-', '-ung'
    position            TEXT NOT NULL,      -- 'prefix', 'suffix', 'circumfix'
    separable           INTEGER,            -- for verbal prefixes (1=sep, 0=insep, NULL=n/a)
    semantic_functions  TEXT DEFAULT '[]',  -- JSON: ["completion","transformation","error"]
    grammatical_effect  TEXT,               -- JSON: {"output_pos":"NOUN","output_gender":"f"}
    sources             TEXT DEFAULT '{}',
    created_at          INTEGER NOT NULL,
    updated_at          INTEGER NOT NULL
);

-- ── Ontology: Morphological decompositions ───────────────────────────────
CREATE TABLE IF NOT EXISTS morphological_decompositions (
    entry_id            TEXT PRIMARY KEY,    -- FK to entries.id ("verstehen|VERB")
    segments            TEXT NOT NULL,       -- JSON: [{"form":"ver","type":"prefix","ref":"prefix:ver"}, ...]
    word_formation_type TEXT,                -- 'prefixation','suffixation','composition','conversion','simplex'
    compound_parts      TEXT,                -- JSON: [{"stem_ref":"...","role":"head|modifier","fugen":"s"}]
    is_compound         INTEGER DEFAULT 0,
    sources             TEXT DEFAULT '{}',
    verified            INTEGER DEFAULT 0    -- 1 = human verified
);

-- ── Ontology: Root-to-entry links (derivation) ──────────────────────────
CREATE TABLE IF NOT EXISTS root_lexeme_links (
    root_id     TEXT NOT NULL,  -- FK to roots.id
    entry_id    TEXT NOT NULL,  -- FK to entries.id
    link_type   TEXT DEFAULT 'derived_from', -- 'derived_from','compound_member'
    PRIMARY KEY (root_id, entry_id)
);

CREATE INDEX IF NOT EXISTS idx_rll_root ON root_lexeme_links(root_id);
CREATE INDEX IF NOT EXISTS idx_rll_entry ON root_lexeme_links(entry_id);

-- ── Ontology: Root adjacency (precomputed for layout) ───────────────────
CREATE TABLE IF NOT EXISTS root_adjacency (
    root_a  TEXT NOT NULL,
    root_b  TEXT NOT NULL,
    weight  REAL DEFAULT 1.0,  -- connection strength (shared lexemes, shared affixes)
    reason  TEXT,               -- 'shared_lexeme:Verständigung', 'shared_affix:ver-'
    PRIMARY KEY (root_a, root_b)
);
```

## 7.3 Ontology JSON Export Format

The `ontology.json` file consumed by the game client. Generated by `tools/export-ontology.py` from the SQLite tables.

```typescript
interface OntologyFile {
  version: string;                    // "0.1.0"
  generated: string;                  // ISO 8601 timestamp
  stats: {
    lexemes: number;
    roots: number;
    affixes: number;
  };
  sources: Record<string, {
    name: string;
    url: string;
    access: "free_online" | "open_data" | "academic";
  }>;
  roots: Record<string, RootData>;     // keyed by root_id
  affixes: Record<string, AffixData>;  // keyed by affix_id
  lexemes: Record<string, LexemeData>; // keyed by entry_id
  adjacency: Array<[string, string, number]>;  // [root_a, root_b, weight]
}

interface RootData {
  id: string;
  form: string;
  stage: string;
  core_meaning: string;
  is_reconstructed: boolean;
  allomorphs: string[];
  cognates: Array<{ lang: string; form: string }>;
  etymology_chain: Array<{
    stage: string;
    form: string;
    meaning?: string;
    is_reconstructed: boolean;
    source: string;
  }>;
  derived_lexemes: string[];  // entry_ids
  sources: Record<string, any>;
}

interface AffixData {
  id: string;
  form: string;
  position: "prefix" | "suffix" | "circumfix";
  separable?: boolean;
  semantic_functions: string[];
  grammatical_effect?: {
    output_pos?: string;
    output_gender?: string;
  };
}

interface LexemeData {
  id: string;            // "verstehen|VERB"
  lemma: string;         // "verstehen"
  pos: string;           // "VERB"
  gender?: string;       // "m" | "f" | "n"
  ipa?: string;
  cefr_level?: string;
  frequency_class?: number;
  definitions: string[];
  morphological_segments: Array<{
    form: string;
    type: "root" | "prefix" | "suffix" | "circumfix" | "linking_element";
    ref?: string;          // root_id or affix_id
  }>;
  word_formation_type: string;
  is_compound: boolean;
  etymology_summary: string;  // Short text for word card display
  root_ids: string[];         // Which roots this lexeme connects to
  sources: Record<string, any>;
}
```

Target file size: ~2–4 MB uncompressed, ~400–800 KB gzipped. Well within browser limits for a single fetch.

---

# 8. Data Pipeline

## 8.1 Pipeline Overview

The pipeline extends the existing `build-db.py` with new ontology-specific steps.

```
┌─────────────────────────────────────────────────────────────┐
│ EXISTING PIPELINE (build-db.py)                             │
│                                                              │
│  FreeDict ──┐                                                │
│  Kaikki  ───┤── merge ──→ entries + forms tables (SQLite)   │
│  IPA-dict ──┤                                                │
│  CEFR    ───┘                                                │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ NEW ONTOLOGY STEPS                                           │
│                                                              │
│  select-vocabulary.py                                        │
│    entries (CEFR A1-A2, content words) → vocabulary_seed     │
│                                                              │
│  extract-etymology.py                                        │
│    Kaikki etymology_templates[] → roots + etymology_chain    │
│                                                              │
│  decompose-morphology.py                                     │
│    vocabulary_seed + Kaikki data → morphological_decomps     │
│                                                              │
│  build-affixes.py                                            │
│    decompositions → affix inventory                          │
│                                                              │
│  export-ontology.py                                          │
│    all tables → ontology.json                                │
│                                                              │
│  validate-ontology.py                                        │
│    ontology.json → validation report                         │
└─────────────────────────────────────────────────────────────┘
```

## 8.2 Pipeline Scripts (Detail)

### `tools/select-vocabulary.py`
- **Input:** `entries` table (from build-db.py), `cefr` data.
- **Logic:** Select ~500 lexemes: all A1 content words (nouns, verbs, adjectives, adverbs), fill remaining from A2, cross-reference against DWDS frequency to ensure high-frequency. Exclude function words (articles, pronouns, prepositions — minimal morphological structure).
- **Output:** Inserts into a `vocabulary_seed` table or writes `data/vocabulary_seed.json`.

### `tools/extract-etymology.py`
- **Input:** Kaikki JSONL files (`raw-data/kaikki/*.jsonl`), specifically the `etymology_templates[]` field.
- **Logic:** For each vocabulary seed lemma:
  1. Find matching Kaikki entry.
  2. Parse `etymology_templates[]` — each template has: `name` (inh/bor/der/cog), `args` (language code + form).
  3. Chain the templates to build root entities at each historical stage: NHG → MHG (gmh) → OHG (goh) → PGmc (gem-pro) → PIE (ine-pro).
  4. For loanwords (bor templates): record the borrowing source (lat, grc, fro).
  5. Build cognate links from `cog` templates.
- **Output:** Populates `roots`, `root_lexeme_links`, `root_adjacency` tables.

### `tools/decompose-morphology.py`
- **Input:** Vocabulary seed + existing `entries` data (etymology_text, derived[], compound_parts, head_templates).
- **Logic:** For each seed lexeme:
  1. Check if Kaikki provides `literal_meaning` (compound decomposition).
  2. Use known prefix/suffix patterns against the lemma (e.g., "ver-" prefix, "-ung" suffix).
  3. Cross-reference with the roots extracted by `extract-etymology.py`.
  4. Fallback: flag as `verified=0` for human review.
- **Output:** Populates `morphological_decompositions` table.

### `tools/build-affixes.py`
- **Input:** `morphological_decompositions` table.
- **Logic:** Collect unique prefixes and suffixes from decompositions. For each affix:
  1. Count frequency of occurrence.
  2. Assign semantic functions from a manually curated seed file (~50–80 common German affixes).
  3. Record grammatical effects (e.g., `-ung` → feminine noun, `-lich` → adjective).
- **Output:** Populates `affixes` table.

### `tools/export-ontology.py`
- **Input:** All ontology tables + `entries` table.
- **Logic:** JOIN across tables, structure into `OntologyFile` format, write JSON.
- **Output:** `data/ontology.json`. Also copies to `game/public/ontology.json`.

### `tools/validate-ontology.py`
- **Input:** `data/ontology.json`.
- **Checks:**
  - Every lexeme references roots and affixes that exist.
  - Every etymology chain has ≥2 stages.
  - Every entry has ≥1 source citation.
  - No orphan roots (roots with no lexemes).
  - IPA strings are syntactically valid (basic regex).
  - Referential integrity across all links.
- **Output:** Validation report to stdout. Exit code 0 if valid, 1 if errors.

## 8.3 API Endpoints (New)

Added to `api/main.py`:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /api/ontology.json` | GET | Serve the static ontology.json file (Phase 0 primary) |
| `GET /api/ontology/root/{root_id}` | GET | Root + full etymology chain + all derived lexemes |
| `GET /api/ontology/family/{root_id}` | GET | Complete root family as self-contained JSON |
| `GET /api/ontology/search/{query}` | GET | Word → decomposition + root references |
| `GET /api/ontology/stats` | GET | Ontology statistics |

For Phase 0, the game client fetches `ontology.json` as a single static file. The API endpoints are optional convenience (useful for debugging and the review tool).

---

# 9. 3D Scene Architecture

## 9.1 Scene Setup

| Component | Specification |
|-----------|--------------|
| Renderer | WebGLRenderer. `antialias: true` desktop, `false` mobile. `pixelRatio: min(devicePixelRatio, 2)`. |
| Camera | PerspectiveCamera, FOV 50, positioned via PlayerController spherical offset. |
| Lighting | 1 DirectionalLight (warm white, intensity 1.0, no shadows) + 1 AmbientLight (cool blue-grey, intensity 0.4). Two lights total. |
| Background | Solid warm parchment. `scene.background = new THREE.Color(0xE8E4D9)`. |
| Fog | `THREE.Fog(0xE8E4D9, 60, 120)`. Hides distant objects, creates atmosphere. |
| CSS2DRenderer | Layered on top of WebGL canvas. For word cards and UI labels. |

## 9.2 World Generation (Simplified)

### Step 1: Root Placement (Force-Directed Layout)

- **Input:** Root adjacency graph from ontology (150–200 nodes, weighted edges).
- **Algorithm:** Simple Fruchterman-Reingold force-directed layout.
  - Repulsion: All roots repel. `F = k_repel / distance²`. Minimum distance: ~8 world units.
  - Attraction: Connected roots attract. `F = k_attract × distance × weight`.
  - Iterations: 200 with simulated annealing (decreasing temperature).
  - Runtime: <50ms for 200 nodes.
- **Output:** `Map<rootId, {x: number, z: number}>` — 2D positions for root monuments.
- **Fallback:** If force-directed produces overlapping clusters, switch to grid layout with semantic-field grouping.

### Step 2: Lexeme Placement Around Roots

For each root, derived lexemes placed in concentric rings:

- Sort by frequency (highest = closest to monument).
- Ring 1 (radius 2): top 4 lexemes.
- Ring 2 (radius 4): next 8 lexemes.
- Ring 3 (radius 6): remaining.
- Angular position: deterministic from lexeme ID hash, evenly distributed.
- Y position: on the terrain surface.

### Step 3: Terrain Generation

- `PlaneGeometry(200, 200, 100, 100)` — the ground.
- Vertex displacement: 2D Perlin noise, amplitude 0.5, frequency 0.05. Gentle rolling hills.
- Vertex colours: height-based lerp between dark green-brown (low) and light green (high).
- Material: `MeshLambertMaterial({ vertexColors: true, flatShading: true })`. Low-poly aesthetic.
- Normal recomputation: `geometry.computeVertexNormals()`.

### Step 4: Path Markers

Between each root monument and its derived word-objects:
- Small spheres at 0.8-unit intervals along straight lines.
- All markers: single `InstancedMesh` (one geometry, one material, N instances). One draw call.

## 9.3 3D Object Specifications

All objects are low-poly, vertex-coloured, procedurally created in code (no external model files).

| Object | Geometry | Visual | Vertices |
|--------|----------|--------|----------|
| Root Monument | `CylinderGeometry(0.3, 0.2, 2, 6)` | Hexagonal pillar. Colour by etymological depth (PIE=deep blue, PGmc=teal, OHG=brown, NHG=green). Label on top. | ~24 |
| Noun Object | `BoxGeometry(0.4, 0.4, 0.4)` | Cube. Colour by semantic field. | ~24 |
| Verb Object | `OctahedronGeometry(0.3, 0)` | Diamond. Gentle rotation (0.5 rad/s). Warm tones. | ~6 |
| Adjective Object | `SphereGeometry(0.25, 4, 3)` | Low-poly sphere. Cool tones. | ~12 |
| Adverb Object | `TetrahedronGeometry(0.25, 0)` | Tetrahedron. Muted tones. | ~4 |
| Ground | `PlaneGeometry(200, 200, 100, 100)` | Perlin-displaced, vertex-coloured. Flat shading. | ~10,000 |
| Path Marker | `SphereGeometry(0.05, 3, 2)` | Tiny dot. Instanced. | ~6 (instanced) |
| Focus Point | `RingGeometry(0.3, 0.4, 16)` | Subtle glowing circle on ground. Semi-transparent. | ~32 |

**Total scene budget:** ~15,000–25,000 vertices. Trivial for any WebGL device.

---

# 10. Interaction System

## 10.1 Raycasting

- On pointer down (click/touch), cast ray from camera through pointer position.
- Test against interactable objects (word-objects + root monuments in a `THREE.Group`).
- Test against ground plane (for click-to-walk navigation).
- Priority: object hit takes precedence over ground hit.

## 10.2 Object Interaction

| Action | Effect |
|--------|--------|
| Hover over word-object | Subtle scale-up (1.0 → 1.15 over 100ms). Emissive increase. |
| Click/tap word-object | Open word card (CSS2D overlay). Camera adjusts to frame object. |
| Click/tap root monument | Open etymology view. Expanded vertical timeline display. |
| Click/tap elsewhere | Dismiss any open card/view. |
| Click/tap ground | Move player focus point there (navigation). |

## 10.3 Word Card (CSS2D Overlay)

The primary information display. Rendered as HTML/CSS via CSS2DRenderer.

**Layout — four sections, revealed progressively:**

**Section 1: Header**
- Lemma in large type (24px, bold). E.g. "verstehen".
- IPA transcription (14px, grey). E.g. /fɛɐ̯ˈʃteːən/.
- POS as coloured pill (Verb=warm orange, Noun=blue, Adj=teal).
- CEFR badge (small, top-right). E.g. "A1".

**Section 2: Morphological Decomposition**
- Word splits into coloured segments with smooth animation (400ms).
- Root: bold dark green (`#2D6A4F`).
- Prefix: blue-grey (`#577590`).
- Suffix: amber (`#CA8A04`).
- Below each segment: type label + function. E.g. "prefix: ver- (completion)" / "root: steh- (to stand)".

**Section 3: Definition**
- Short English definition.
- Source citation in small text (e.g. "Def: DWDS").

**Section 4: Etymology Summary**
- Compact chain: NHG ← MHG ← OHG ← PGmc ← PIE.
- Reconstructed forms marked with *.
- Source icons (tap → open external URL).
- Cognates listed: "Cf. English: stand, Dutch: staan, Swedish: stå".

**Styling:**
```css
--card-bg: rgba(255, 253, 247, 0.95);  /* warm parchment */
--card-border: rgba(180, 170, 150, 0.3);
--card-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
--card-radius: 12px;
--text-primary: #1A1A2E;
--text-secondary: #666;
--colour-root: #2D6A4F;
--colour-prefix: #577590;
--colour-suffix: #CA8A04;
```

Max width: 320px. System font stack. Scale-in animation (0.9 → 1.0 over 200ms, ease-out).

## 10.4 Etymology View (Root Monument)

Tapping a root monument opens an expanded timeline:
- Full etymology chain displayed as a vertical timeline.
- Each stage: stage label + form + meaning + source link.
- All derived lexemes listed at the bottom with CEFR badges.
- Cognates section.

## 10.5 Source Links

Every piece of information has a traceable source. Sources shown as small superscript footnotes. Tapping opens the source URL:

- DWDS: `https://dwds.de/wb/[lemma]`
- DWDS etymology: `https://dwds.de/wb/etymwb/[lemma]`
- Wiktionary: `https://de.wiktionary.org/wiki/[lemma]`

---

# 11. Search & Navigation

## 11.1 Search Bar

Plain HTML input, fixed at top of viewport. Hidden by default, toggled by magnifying glass icon (top-right).

**Behaviour:**
1. User types a German word (or partial).
2. Dropdown shows matching lemmas from ontology (prefix match + umlaut transliteration: ue→ü, ae→ä, oe→ö, ss→ß). Max 8 results.
3. User selects a result → camera smoothly animates to that word-object (lerp over 800ms).
4. Word card auto-opens.
5. Search bar dismisses.

**Implementation:**
- OntologyStore has a `searchLemma(query)` method.
- Camera animation: lerp focus point position to target's world coordinates.

---

# 12. Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Frame rate (desktop Chrome) | 60 fps steady | Chrome DevTools Performance |
| Frame rate (mobile Chrome, 2022 mid-range) | 30 fps steady, target 60 | Remote debugging |
| Initial load time | < 3 seconds (ontology + scene) | Lighthouse, Network tab |
| Ontology parse time | < 200ms | performance.now() |
| Raycaster response | < 16ms (within frame budget) | performance.now() |
| Memory (JS heap) | < 80MB | Chrome DevTools Memory |
| Bundle size (gzipped) | < 300KB JS + < 800KB ontology | Vite build + gzip |

## 12.1 Key Optimisations

1. **Instanced rendering** for path markers (~1,000–2,000 small spheres → 1 draw call).
2. **Frustum culling** (Three.js default — objects outside camera view not rendered).
3. **LOD for labels:** CSS2D labels created/destroyed based on camera distance. Object pool to avoid GC.
4. **Deferred ontology parsing:** Parse in Web Worker if available, main-thread `requestIdleCallback` fallback.
5. **Render-on-demand:** Only re-render when dirty (camera moved, animation active, selection changed). Skip redundant frames.

## 12.2 Mobile-Specific

- Touch handling: distinguish pan (one-finger drag), zoom (pinch), rotate (two-finger drag), tap (start + end < 200ms, < 10px movement).
- Pixel ratio clamped to 2.0.
- Viewport: `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">`.
- CSS: `100dvh` for dynamic viewport height.
- Virtual joystick: only shown on touch devices.

---

# 13. Module Architecture

## 13.1 Module List

| Module | File(s) | Responsibility |
|--------|---------|---------------|
| main | `main.ts` | Entry point, orchestrate init sequence |
| OntologyStore | `data/OntologyStore.ts` | Load, index, query ontology data |
| SceneManager | `scene/SceneManager.ts` | Renderer, camera, lights, render loop |
| PlayerController | `player/PlayerController.ts` | Focus point, camera follow, all input methods |
| WorldGenerator | `world/WorldGenerator.ts` | Orchestrates world generation |
| TerrainBuilder | `world/TerrainBuilder.ts` | Ground plane with noise displacement |
| LayoutEngine | `world/LayoutEngine.ts` | Force-directed root placement |
| ObjectPlacer | `world/ObjectPlacer.ts` | Place root monuments, word objects, paths |
| EntityFactory | `entities/EntityFactory.ts` | Create 3D meshes with correct geometry/colour |
| InteractionManager | `entities/InteractionManager.ts` | Raycasting, hover, selection, card trigger |
| WordCard | `ui/WordCard.ts` | CSS2D word card overlay |
| EtymologyView | `ui/EtymologyView.ts` | Etymology chain display |
| SearchBar | `ui/SearchBar.ts` | HTML search with autocomplete |
| NoiseGenerator | `utils/noise.ts` | Perlin/simplex noise |
| Helpers | `utils/helpers.ts` | Math, colour, hash utilities |

## 13.2 Initialisation Sequence

```typescript
// main.ts
async function init() {
  // 1. Scene infrastructure (synchronous, fast)
  const sceneManager = new SceneManager(document.getElementById('app')!);

  // 2. Load ontology data (async, ~200ms–1s)
  const store = new OntologyStore();
  await store.load('/ontology.json');

  // 3. Generate world from ontology (sync, ~50–200ms)
  const worldGen = new WorldGenerator(store, sceneManager.scene);
  const worldState = worldGen.generate();

  // 4. Player controller (sync, fast)
  const player = new PlayerController(
    sceneManager.camera,
    sceneManager.renderer.domElement,
    worldState.terrain
  );

  // 5. Interaction manager (sync, fast)
  const interaction = new InteractionManager(
    sceneManager.camera,
    sceneManager.renderer.domElement,
    worldState,
    store
  );

  // 6. UI setup (sync, fast)
  const searchBar = new SearchBar(store, player);

  // 7. Start render loop
  sceneManager.start((delta: number) => {
    player.update(delta);
    interaction.update(delta);
  });
}

init();
```

## 13.3 Data Flow

```
ontology.json
    │
    ▼
OntologyStore (indexes: lemma→id, root→lexemes, adjacency graph)
    │
    ├──→ WorldGenerator
    │       ├── LayoutEngine (root positions from adjacency graph)
    │       ├── TerrainBuilder (ground plane)
    │       └── ObjectPlacer (monuments, word objects, paths)
    │               └── EntityFactory (mesh creation)
    │
    ├──→ InteractionManager
    │       ├── Raycasting → hit detection
    │       ├── WordCard (populated from OntologyStore)
    │       └── EtymologyView (populated from OntologyStore)
    │
    ├──→ SearchBar
    │       └── searchLemma() → camera animation via PlayerController
    │
    └──→ PlayerController
            └── focus point + camera + input handling
```

---

# 14. Implementation Timeline

Weeks are development weeks. Assumes one developer working full-time. Two developers can parallelize data + game tracks.

## Week 1: Foundation — Dev Environment + Data Pipeline Extension

| Task | Detail | Output |
|------|--------|--------|
| Docker dev container | `Dockerfile.dev` + `docker-compose.yml` | `docker compose up` works |
| Game scaffold | `game/` directory, `package.json`, `tsconfig.json`, `vite.config.ts`, blank `index.html` | `npm run dev` serves empty page |
| Extend `schema.sql` | Add `roots`, `affixes`, `morphological_decompositions`, `root_lexeme_links`, `root_adjacency` tables | Schema ready |
| Write `select-vocabulary.py` | Select 500 A1-A2 content words from entries table | `vocabulary_seed.json` |
| Write `extract-etymology.py` | Parse Kaikki `etymology_templates[]` → roots + chains | `roots` table populated |

## Week 2: Ontology Pipeline Complete + Scene Setup

| Task | Detail | Output |
|------|--------|--------|
| Write `decompose-morphology.py` | Automated decomposition using Kaikki + root data | `morphological_decompositions` table |
| Write `build-affixes.py` | Extract affix inventory | `affixes` table |
| Write `export-ontology.py` + `validate-ontology.py` | SQLite → `ontology.json` + validation | `data/ontology.json` valid |
| Implement `OntologyStore` | TypeScript class: fetch, parse, index, query | Ontology data queryable in browser |
| Implement `SceneManager` | WebGL renderer, camera, lights, background, fog, render loop | Empty 3D scene running |

## Week 3: World Generation + Player Controller

| Task | Detail | Output |
|------|--------|--------|
| Implement `TerrainBuilder` | Perlin noise terrain with vertex colours + flat shading | Navigable ground plane |
| Implement `LayoutEngine` | Fruchterman-Reingold force-directed layout | Root positions computed |
| Implement `EntityFactory` | Low-poly meshes for each POS type + root monuments | 3D objects created |
| Implement `ObjectPlacer` | Place monuments + word objects + path markers | Objects in world |
| Implement `PlayerController` | Click-to-walk + WASD + zoom + rotate + virtual joystick | Player can move through world |

## Week 4: Interaction + Word Card

| Task | Detail | Output |
|------|--------|--------|
| Implement `InteractionManager` | Raycasting, hover effects, selection | Tap objects for interaction |
| Implement `WordCard` | CSS2D overlay with all four sections | Tap word → see morphology + etymology |
| Implement `EtymologyView` | Expanded chain display for root monuments | Tap monument → see full history |
| Implement `SearchBar` | HTML input, autocomplete, camera fly-to | Type word → navigate to it |

## Week 5: Integration + Polish + Mobile

| Task | Detail | Output |
|------|--------|--------|
| Integration testing | All modules working together with real ontology data | Full prototype running |
| Manual data review | Spot-check 50 entries; fix decomposition errors | Data quality verified |
| Performance tuning | Profiling, instanced rendering, LOD for labels | Meets perf targets |
| Mobile testing | Android Chrome, touch interactions, virtual joystick | 30+ fps on mobile |
| Bug fixes + visual polish | Colours, spacing, card styling, animation timing | Looks good |

## Week 6: Final Polish + Deploy

| Task | Detail | Output |
|------|--------|--------|
| Cross-browser testing | Desktop Chrome, Firefox; mobile Chrome | Works everywhere |
| Build + deploy | Vite production build → static hosting | Live at public URL |
| Data quality final pass | Fix any remaining errors from spot-check | ≤5 errors in 50-entry sample |
| Documentation | Update README with project description + link | Repo presentable |

**Total: ~6 weeks.** Critical path: ontology data pipeline (weeks 1–2) must complete before game can show real data (week 3+). Game scaffolding starts in parallel.

---

# 15. Data Pipeline — Execution Sequence

The complete reproducible build from zero to playable game:

```bash
# ── 0. Prerequisites (inside Docker container) ──────────────

# Kaikki JSONL files should already be in raw-data/kaikki/
# FreeDict, IPA-dict, CEFR already in raw-data/

# ── 1. Build dictionary database (existing pipeline) ────────

python3 tools/build-db.py

# Outputs: data/urwort.db with entries + forms + FTS + meta

# ── 2. Select vocabulary seed ────────────────────────────────

python3 tools/select-vocabulary.py

# Outputs: data/vocabulary_seed.json (500 A1-A2 lexemes)

# ── 3. Extract etymology chains from Kaikki ──────────────────

python3 tools/extract-etymology.py

# Outputs: roots + root_lexeme_links + root_adjacency tables

# ── 4. Decompose morphology ──────────────────────────────────

python3 tools/decompose-morphology.py

# Outputs: morphological_decompositions table

# ── 5. Build affix inventory ─────────────────────────────────

python3 tools/build-affixes.py

# Outputs: affixes table

# ── 6. Export ontology JSON ──────────────────────────────────

python3 tools/export-ontology.py

# Outputs: data/ontology.json + game/public/ontology.json

# ── 7. Validate ──────────────────────────────────────────────

python3 tools/validate-ontology.py

# Outputs: validation report, exit 0 if clean
```

Each script is independently runnable and idempotent. Total pipeline time: ~5–15 minutes (dominated by Kaikki parsing).

---

# 16. Risk Register

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| Kaikki `etymology_templates[]` coverage too low for 500 lexemes | High | Medium | Cross-reference with `etymology_text` (free text). Fall back to manual etymology entry for gaps. Even 300 well-covered entries prove the concept. |
| Automated morphological decomposition quality too low | High | Medium | Rely on Kaikki's `derived[]`, `literal_meaning`, and known affix patterns rather than NLP tools. Manual verification of all 500 entries (~40–60 hours). |
| Navigation model doesn't feel like exploration | High | Low | Multiple input methods (§6). If click-to-walk doesn't feel right, tweak camera distance/speed. The hybrid approach gives many tuning knobs. |
| Force-directed layout produces ugly overlapping clusters | Medium | Medium | Tune force parameters (repulsion strength, temperature schedule). Add minimum-distance constraint. Fallback: grid layout with semantic clustering. |
| Mobile performance below 30 fps | Low | Low | Scene is <25K vertices. If still slow: reduce terrain resolution, disable fog, use MeshBasicMaterial. |
| Docker environment issues on different host OSes | Medium | Low | Use standard Node 22 + Python 3 base image. Avoid host-specific mounts. Test on Linux + Mac. |
| Manual data verification takes longer than estimated | Medium | Medium | Start with 200 entries (A1 only). Ship Phase 0 with 200 if needed. Expand to 500 in patch. |
| TypeScript + Three.js type definitions incomplete | Low | Medium | Three.js has excellent TS types. Use `@types/three`. For custom code, start with loose types, tighten later. |

---

# 17. Testing Strategy

## 17.1 Data Validation (Automated)

`validate-ontology.py` runs automated checks:
- Every lexeme references existing roots and affixes.
- Every etymology chain has ≥2 stages.
- Every entry has ≥1 source citation.
- No orphan roots.
- All `source_ids` map to entries in the sources registry.
- IPA strings pass basic syntax regex.
- All root → lexeme links are bidirectional.

## 17.2 Data Spot-Check (Manual)

50 randomly selected lexemes (10% of dataset):
- Morphological decomposition matches Wiktionary.
- Etymology chain matches DWDS Pfeifer.
- Definition is accurate and sourced.
- CEFR level matches Goethe-Institut word list.
- Source URLs resolve correctly.

**Pass threshold:** ≤5 of 50 have errors.

## 17.3 Visual / Interactive Testing (Manual)

- **Desktop Chrome:** Navigate world. Tap 20+ word-objects. Verify decomposition display. Verify etymology chains. Verify source links open correct URLs. Verify search bar works.
- **Mobile Chrome (Android):** Same. Confirm touch works. Confirm 30+ fps. Confirm word cards readable. Confirm virtual joystick works.
- **Performance:** Record 30-second Chrome Performance trace. No frame drops below target. No long tasks or GC pauses.

## 17.4 No Automated UI Tests

Phase 0 does not warrant automated tests for the 3D code. The scene is simple, the interactions are few, and visual testing is faster and more appropriate. Unit tests for `OntologyStore` query methods and `LayoutEngine` placement algorithm are worthwhile; everything else is visual.

---

# 18. Open Questions (Deferred to Phase 1+)

These questions are acknowledged but explicitly not resolved in Phase 0:

1. **"Peaceful respite" vs. "game" narrative tension.** Phase 0 implements both contemplation (exploration) and game mechanics (discovery + decomposition display) minimally. Phase 1 develops an overarching narrative that reconciles them.
2. **Root granularity.** Is Licht the same root as leicht? For Phase 0, follow Wiktionary's grouping. Phase 1 adds a "synchronic transparency" score.
3. **Ablaut handling.** sprech-/sprach-/sproch- treated as allomorphs of a single root. Documented but not deeply modelled.
4. **Compound recursion depth.** Phase 0 handles one level of compounding. Recursive decomposition (Donaudampfschifffahrtsgesellschaftskapitän) is Phase 1.
5. **Dialect variants.** Not addressed. Phase 3+.
6. **Semantic drift.** Not modelled. Phase 1 can add meaning-evolution per etymology stage.
7. **Graph database migration.** SQLite works for 500 lexemes. Neo4j or similar for Phase 1 (2,000+ lexemes with complex traversals).
8. **WFC world generation.** Phase 1 replaces force-directed with Wave Function Collapse for richer terrain.
9. **Audio integration.** Phase 1-2: pronunciation playback, ambient soundscapes.
10. **SRS integration.** Phase 1-2: hidden spaced repetition engine driving exploration incentives.
11. **Compound bridge walking animation.** Phase 0 shows compound decomposition on word cards. Phase 1 adds 3D bridge crossing with visual decomposition animation.

---

# 19. Definition of Done

Phase 0 is complete and ready for Phase 1 handoff when ALL of these are true:

- [ ] **Ontology data:** `ontology.json` contains 500 verified lexemes with morphological decomposition, etymology chains (min 2 stages each), definitions, frequency data, CEFR annotations, and source citations.
- [ ] **3D world:** A navigable 3D terrain with root monuments and word-objects placed according to the ontology graph.
- [ ] **Navigation:** Hybrid click-to-walk + WASD + zoom + rotate + mobile joystick. Feels like exploration.
- [ ] **Interaction:** Tap any word-object → word card with decomposition, definition, etymology, sources. Tap root monument → full etymology chain.
- [ ] **Search:** Type a German word → camera navigates to it, word card opens.
- [ ] **Source links:** Every word card and etymology view has clickable source citations.
- [ ] **Performance:** 60 fps desktop Chrome, 30+ fps mobile Chrome. Load < 3 seconds.
- [ ] **Data quality:** Spot-check of 50 random entries: ≤5 errors.
- [ ] **Docker:** `docker compose up` starts the complete dev environment.
- [ ] **Deployed:** Live at a public URL (static build).
- [ ] **Open source:** Repository public on GitHub. MIT (code) + CC BY-SA (data).

---

# 20. Immediate Next Steps

In order of execution:

1. **Scaffold Docker dev container** — `Dockerfile.dev` + `docker-compose.yml`.
2. **Scaffold `game/` directory** — `package.json` (three, typescript, vite), `tsconfig.json`, `vite.config.ts`, blank `index.html`.
3. **Extend `schema.sql`** with ontology tables.
4. **Write `select-vocabulary.py`** — select 500 A1-A2 lexemes from existing DB.
5. **Write `extract-etymology.py`** — parse Kaikki `etymology_templates[]` into roots.
6. **Write `decompose-morphology.py`** + **`build-affixes.py`**.
7. **Write `export-ontology.py`** + **`validate-ontology.py`**.
8. **Run full pipeline** — produce `ontology.json`.
9. **Implement game modules** (weeks 2–4 per timeline).
10. **Integrate, test, polish, deploy** (weeks 5–6).
