**URWORT — Phase 0 Implementation Plan**

_The single reference document for Phase 0 development._

_Supersedes: `phase0_spec.md` (original), `implementation_audit.md` (bridge analysis)._

_Incorporates all design decisions from game_design.md, ontology_spec.md, and user clarifications._

March 2026

---

# 0. Decision Log

All major design decisions for Phase 0, recorded with rationale.

| # | Decision | Rationale | Status |
|---|----------|-----------|--------|
| D1 | Use TypeScript (not vanilla JS) | Type safety at scale; catches ontology mismatches early | ✅ Done |
| D2 | SQLite for Phase 0 (not Neo4j/graph DB) | Minimal infra; existing pipeline uses it; graph DB in Phase 1 | ✅ Done |
| D3 | Docker dev container (not host install) | Reproducible environment; zero host system pollution | ✅ Done |
| D4 | Keep existing data pipeline, extend it | 60-70% of data work already done; avoid rewriting parsers | ✅ Done |
| D5 | Replace client entirely (new `game/` dir) | Dictionary UI has zero reusable components for 3D game | ✅ Done |
| D6 | No audio in Phase 0 | Reduces scope; audio added in Phase 1-2 | ✅ Enforced |
| D7 | No exercises/practice mechanics | Phase 0 is discovery-only; exercises are Phase 1 | ✅ Enforced |
| D8 | No SRS / spaced repetition | Phase 0 proves exploration; SRS is Phase 1-2 | ✅ Enforced |
| D9 | No PWA / service worker / offline | Phase 0 is a served static site; PWA is Phase 2 | ✅ Enforced |
| D10 | Minimal ontology entities only | No SoundChange, no separate Kompositum, no computed scores | ✅ Done |
| D11 | Grid layout first, force-directed later | Grid is predictable for prototype; force-directed is Phase 0.5 | ✅ Grid done |
| D12 | MapControls + WASD + fly-to navigation | Battle-tested touch/mouse handling; custom WASD + fly-to on top | ✅ Done |
| D13 | Three.js direct (no react-three-fiber) | Maximum control, minimal abstraction for prototype | ✅ Done |
| D14 | Accept "contemplative vs. game" tension | Both aspects implemented minimally; narrative resolution in Phase 1 | ✅ Enforced |
| D15 | Compound bridges: text-based fallback | Keep pedagogical idea; 3D decomposition if time allows | ✅ Done (text labels) |
| D16 | Avoid inaccessible sources | Skip GermaNet, CELEX, COSMAS II; use open sources only | ✅ Enforced |
| D17 | ~500 lexemes (A1-A2 core) | Enough to prove concept; expand in Phase 1 | ✅ ~600 words exported |
| D18 | GitHub Pages for static hosting | Zero cost; CI/CD via GitHub Actions; `pages-deploy` branch trigger | ✅ Done |
| D19 | MapControls over custom camera | Robust damping, touch gestures, polar limits built-in; custom fly-to layered on top | ✅ Done |
| D20 | Single `export-ontology.py` over 6 scripts | Simpler pipeline; avoids intermediate state; does vocabulary selection + etymology extraction + export in one pass | ✅ Done |
| D21 | `ontology.json` committed to git | Small file (~400KB); needed for static GitHub Pages deploy; avoids build-time DB dependency | ✅ Done |

---

# 1. What Phase 0 Proves

**One hypothesis:** Walking through a spatial representation of the German root-word ontology, tapping objects to discover morphological structure and etymological depth, is a compelling and educationally sound experience.

Phase 0 proves this or falsifies it. Everything that doesn't serve this hypothesis is deferred.

## 1.1 Success Criteria

Phase 0 is complete when ALL of the following are true:

| # | Criterion | Status |
|---|-----------|--------|
| 1 | A user can open the app and see a 3D world with word-objects at 30+ fps on mobile Chrome | ✅ **Done** |
| 2 | Tapping any word-object shows its morphological decomposition with root highlighted | ⚠️ **Partial** — card shows word + root info, but no colour-coded segment breakdown yet |
| 3 | Tapping a root monument shows the etymological chain from NHG back to deepest ancestor | ❌ **Not done** — island card shows word list, but no timeline/chain display |
| 4 | The search bar works: type "Haus", camera flies to it | ❌ **Not done** |
| 5 | Navigation feels like exploration, not like browsing a diagram | ✅ **Done** — MapControls + WASD + fly-to feels spatial |
| 6 | All ~500 lexemes are present with correct decomposition, definition, and etymology | ⚠️ **Partial** — 600+ words present, definitions included, etymology roots extracted, but no morphological segment display |
| 7 | Source citations are visible on every word card | ❌ **Not done** |
| 8 | Performance: 60 fps desktop, 30+ fps mobile, load < 3s | ✅ **Done** |
| 9 | Runs in Docker: `docker compose up` and open browser | ✅ **Done** |

## 1.2 Explicitly Out of Scope

- No WFC world generation. Grid + procedural terrain only.
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

# 2. What We Kept from the Existing Codebase

## 2.1 KEPT: Data Pipeline (`tools/`)

| File | What it does | Status |
|------|-------------|--------|
| `tools/build-db.py` | FreeDict + Kaikki + IPA-dict + CEFR → SQLite | ✅ Kept (unchanged) |
| `tools/schema.sql` | Dictionary schema (entries, forms, FTS, meta) | ✅ Kept (unchanged) |
| `tools/export-ontology.py` | **NEW** — SQLite + Kaikki → `ontology.json` | ✅ Created |

> **Architecture note:** The original plan called for 6 separate pipeline scripts (`select-vocabulary.py`, `extract-etymology.py`, `decompose-morphology.py`, `build-affixes.py`, `export-ontology.py`, `validate-ontology.py`). In practice, a single `export-ontology.py` handles vocabulary selection, etymology extraction, root clustering, compound detection, and JSON export. This is simpler and avoids intermediate state. Morphological decomposition and affix extraction are deferred to Phase 0.5.

## 2.2 KEPT: Raw Data (`raw-data/`)

| Source | Path | What we have |
|--------|------|-------------|
| FreeDict DE↔EN | `raw-data/freedict/` | StarDict binary (44k headwords) |
| Kaikki German by POS | `raw-data/kaikki/*.jsonl` | Nouns, verbs, adjectives (structured Wiktionary) |
| IPA-dict | `raw-data/ipa-dict/de.tsv` | 130k IPA transcriptions |
| CEFR | `raw-data/cefr/de.tsv` | A1-C2 word level tags |

## 2.3 KEPT: API Server (`api/`)

| File | Status |
|------|--------|
| `api/main.py` | ✅ Kept; `__init__.py` added for module imports |
| `api/db.py` | ✅ Kept |
| `api/enrichment.py` | ✅ Kept |
| `api/config.py` | ✅ Kept |
| `api/models.py` | ✅ Kept |

The FastAPI server runs alongside Vite in the Docker container. New game-specific endpoints are planned but not yet added (the game loads `ontology.json` as a static file).

## 2.4 REMOVED: Old Client (`src/`)

The legacy dictionary PWA (`src/js/app.js`, `search.js`, `db.js`, `index.html`, service worker, CSS) was **removed** from the repository during cleanup. The game client in `game/` is the sole client.

Also removed:
- `src/` directory (entire old dictionary client)
- `infra/` directory (old Docker/nginx configs)
- `tools/build-dict.py` (legacy static JSON builder)
- `docs/implementation_audit.md` (superseded by this document)
- `docs/phase0_spec.md` (superseded by this document)
- Various legacy config files (`nginx.conf`, old `docker-compose.yml`, etc.)

---

# 3. Repository Structure (Actual)

```
extras/urwort/
├── .github/
│   └── workflows/
│       └── deploy-pages.yml        # GitHub Pages CI/CD
│
├── game/                            # Phase 0 game client
│   ├── src/
│   │   ├── main.ts                  # Entry: init scene, load data, render loop, interactions
│   │   ├── types/
│   │   │   ├── ontology.ts          # Wurzel, Wort, RootCluster, CompoundLink types
│   │   │   ├── world.ts             # Island, Bridge, WorldLayout types
│   │   │   └── index.ts             # Re-exports
│   │   ├── data/
│   │   │   ├── loader.ts            # Fetch + filter ontology.json
│   │   │   └── mock.ts              # 5 example clusters for offline dev
│   │   ├── scene/
│   │   │   └── renderer.ts          # WebGL renderer, camera, lights, ground plane
│   │   ├── world/
│   │   │   ├── layout.ts            # Grid layout for islands
│   │   │   ├── island.ts            # Island meshes (cylinder + word pillars + labels)
│   │   │   └── bridge.ts            # Bridge meshes (plank + label)
│   │   ├── player/
│   │   │   ├── camera.ts            # CameraController (MapControls + WASD + fly-to)
│   │   │   └── input.ts             # Keyboard state (WASD/arrows)
│   │   ├── ui/
│   │   │   └── word-card.ts         # Word info card + island overview card (HTML overlay)
│   │   ├── entities/                # (empty — future: EntityFactory, InteractionManager)
│   │   ├── utils/                   # (empty — future: noise, helpers)
│   │   └── vite-env.d.ts            # Vite env type declarations
│   ├── public/
│   │   └── ontology.json            # Pre-built ontology data (committed to git)
│   ├── index.html                   # HTML shell with loading screen
│   ├── package.json                 # three, typescript, vite
│   ├── package-lock.json
│   ├── tsconfig.json
│   └── vite.config.ts               # Path aliases, base path from env
│
├── tools/
│   ├── build-db.py                  # Existing: FreeDict + Kaikki + IPA + CEFR → SQLite
│   ├── schema.sql                   # Existing: entries, forms, FTS, meta tables
│   └── export-ontology.py           # NEW: SQLite + Kaikki → ontology.json
│
├── api/                             # FastAPI server (runs in Docker)
│   ├── __init__.py
│   ├── main.py
│   ├── db.py
│   ├── config.py
│   ├── models.py
│   ├── enrichment.py
│   ├── dwds.py
│   ├── kaikki.py
│   ├── cache.py
│   └── requirements.txt
│
├── raw-data/                        # Source data (gitignored, must be present for DB build)
│   ├── freedict/
│   ├── kaikki/
│   ├── ipa-dict/
│   └── cefr/
│
├── data/
│   └── urwort.db                    # Built SQLite DB (gitignored)
│
├── docs/
│   ├── phase0_implementation_plan.md  # THIS DOCUMENT
│   ├── game_design.md
│   ├── ontology_spec.md
│   └── knowledge_base.md
│
├── docker-compose.yml               # Dev container: Vite + FastAPI
├── Dockerfile.dev                   # Node 22 + Python 3 + SQLite
├── .dockerignore
├── .gitignore
└── README.md
```

---

# 4. Development Environment

## 4.1 Docker Dev Container

A single `docker compose up` starts the complete development environment with both the Vite dev server (port 5173) and FastAPI server (port 8000).

**`docker-compose.yml`** — Mounts source code for live editing; persists node_modules in a Docker volume to avoid host/container mismatch.

**`Dockerfile.dev`** — Based on `node:22-bookworm-slim`. Installs Python 3, pip, venv, SQLite, git. Creates a Python venv at `/opt/venv`. Pre-installs both npm and pip dependencies for layer caching.

## 4.2 Development Workflow

```bash
# Start everything (game + API)
docker compose up

# Access:
#   Game:  http://localhost:5173
#   API:   http://localhost:8000/api/health
#   Mobile (same WiFi): http://<host-ip>:5173

# Shell into the container
docker compose exec dev bash

# Rebuild ontology data (inside container)
cd /workspace && python3 tools/export-ontology.py

# Production build (inside container)
cd /workspace/game && npm run build
```

## 4.3 GitHub Pages Deployment

The game is deployed to GitHub Pages via a GitHub Actions workflow.

- **Trigger:** Push to `pages-deploy` branch
- **Workflow:** `.github/workflows/deploy-pages.yml`
- **URL:** `https://<user>.github.io/urwort/`
- **Deploy command:** `git push origin main:pages-deploy --force`
- **Base path:** Set via `VITE_BASE_PATH=/urwort/` env var at build time
- **Data:** `ontology.json` is committed to `game/public/` and included in the build

---

# 5. Tech Stack

## 5.1 Game Client

| Concern | Choice | Status |
|---------|--------|--------|
| Language | TypeScript (ES2022+ target) | ✅ Done |
| Build system | Vite 6.x | ✅ Done |
| 3D engine | Three.js (r170+) | ✅ Done |
| Camera controls | Three.js MapControls + custom WASD/fly-to layer | ✅ Done |
| UI overlay | HTML/CSS injected by TypeScript | ✅ Done |
| Framework | None (direct DOM + Three.js) | ✅ Done |
| State management | Plain TypeScript (no libraries) | ✅ Done |

## 5.2 Runtime Dependencies

| Package | Purpose | Size |
|---------|---------|------|
| `three` | Three.js core + addons (MapControls) | ~600KB minified |

That's it. One runtime dependency. No state management library, no UI framework, no animation library, no tween library.

## 5.3 Data Pipeline & API

| Concern | Choice | Status |
|---------|--------|--------|
| Pipeline language | Python 3.11+ | ✅ Done |
| Database | SQLite 3 (WAL mode) | ✅ Done |
| API framework | FastAPI + Uvicorn | ✅ Done (runs in Docker) |

## 5.4 Infrastructure

| Concern | Choice | Status |
|---------|--------|--------|
| Dev environment | Docker Compose | ✅ Done |
| Node.js | 22 LTS | ✅ Done |
| Deployment | GitHub Pages (static) | ✅ Done |
| CI/CD | GitHub Actions | ✅ Done |

---

# 6. Navigation Model

## 6.1 Implemented: MapControls + WASD + Fly-to

The original plan proposed a fully custom `PlayerController` (~400 lines). In practice, we use **Three.js MapControls** as the base (battle-tested touch/mouse handling, damping, polar limits) and layer custom features on top.

### Input Methods (all active simultaneously)

| Input | Desktop | Mobile | What it does |
|-------|---------|--------|-------------|
| **Left-drag** | Left-click + drag | 1-finger drag | Pan across world (XZ plane) |
| **Right-drag** | Right-click + drag | 2-finger rotate | Orbit camera around target |
| **Scroll** | Mouse wheel | Pinch | Zoom in/out |
| **WASD / Arrows** | Keyboard | N/A | Translate camera target on XZ plane |
| **Tap object** | Click word pillar | Tap word pillar | Show word info card |
| **Tap island** | Click island | Tap island | Fly camera to island + show root card |
| **Tap empty** | Click empty space | Tap empty space | Dismiss info card |
| **Escape** | Keyboard | N/A | Dismiss info card |

### Camera Configuration

```
MapControls settings:
  enableDamping: true
  dampingFactor: 0.08
  minDistance: 8          (closest zoom)
  maxDistance: 100        (farthest zoom)
  minPolarAngle: 0.2     (nearly top-down)
  maxPolarAngle: 1.45    (nearly horizon)
  panSpeed: 1.5
  rotateSpeed: 0.5
  screenSpacePanning: false  (pan along world XZ, not screen space)

WASD layer:
  moveSpeed: 25 units/sec
  Direction: camera-forward projected onto XZ plane

Fly-to animation:
  duration: 0.8s
  easing: cubic ease-out
  target: island center position
```

### Why MapControls + Custom Layer

1. **MapControls** handles all pointer/touch complexity (drag disambiguation, inertia, polar clamping, pinch-zoom) — well-tested across browsers and devices.
2. **Custom WASD layer** translates the MapControls target along the camera's XZ-projected forward/right vectors, giving a game-like movement feel.
3. **Custom fly-to** smoothly animates the target position with cubic ease-out, used when tapping islands.
4. **No virtual joystick** yet — MapControls' 1-finger pan works well on mobile. Virtual joystick is Phase 0.5 if needed.

### Implementation

- `player/camera.ts` — `CameraController` class (~150 lines): wraps MapControls, adds WASD translation, fly-to animation
- `player/input.ts` — `KeyboardState` + `bindKeyboard()` (~60 lines): tracks WASD/arrow key state

### Not Implemented (Deferred)

- Virtual joystick (MapControls pan is sufficient for now)
- Click-to-walk (tap on ground → move there)
- Focus point marker (glowing ring on ground)
- Edge panning

---

# 7. Ontology Data Model (Phase 0 — Minimal)

## 7.1 TypeScript Types

The game client uses these types (defined in `game/src/types/ontology.ts`):

```typescript
interface Wurzel {
  id: string;
  form: string;            // e.g. "fahr"
  meaning_de: string;
  meaning_en: string;
  origin_lang: string;     // "PIE" | "OHG" | "MHG" | "Proto-Germanic" etc.
  proto_form?: string;     // e.g. "*per-" for PIE ancestor
}

interface Wort {
  id: string;
  lemma: string;           // e.g. "Erfahrung"
  pos: string;             // part of speech
  ipa?: string;
  frequency?: number;
  cefr_level?: string;     // A1-C2
  definition_de?: string;
  definition_en?: string;
}

interface CompoundLink {
  compound_wort_id: string;
  component_wort_ids: string[];
  split_display: string;   // e.g. "Fahr·rad"
}

interface RootCluster {
  wurzel: Wurzel;
  words: Wort[];
  links: WurzelWortLink[];
  compounds: CompoundLink[];
}
```

## 7.2 `ontology.json` Format

The static JSON file consumed by the game client. Generated by `tools/export-ontology.py`.

```json
{
  "version": 1,
  "stats": {
    "total_clusters": 333,
    "multi_word_clusters": 82,
    "total_words": 635,
    "total_compounds": 48
  },
  "clusters": [
    {
      "wurzel": { "id": "r-0", "form": "fahr", "origin_lang": "OHG", ... },
      "words": [ { "id": "fahren|VERB", "lemma": "fahren", ... }, ... ],
      "links": [ { "wurzel_id": "r-0", "wort_id": "fahren|VERB" }, ... ],
      "compounds": [ { "compound_wort_id": "...", "split_display": "Fahr·rad" }, ... ]
    },
    ...
  ]
}
```

Current file size: ~400KB uncompressed.

## 7.3 Pipeline Architecture

The plan originally specified 6 separate scripts. In practice, a single `tools/export-ontology.py` handles the full pipeline:

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
│ export-ontology.py (single script, 6 phases)                │
│                                                              │
│  Phase A: load_vocabulary()                                  │
│    entries (CEFR A1-A2, content words) → vocab dict          │
│                                                              │
│  Phase B: load_kaikki_etymology()                            │
│    Kaikki JSONL → etymology_templates per word               │
│                                                              │
│  Phase C: extract_root() per word                            │
│    etymology_templates → root form + lang + proto_form       │
│    Priority: PIE > Proto-Germanic > OHG > MHG                │
│                                                              │
│  Phase D: build_root_clusters()                              │
│    Group words by shared root → RootCluster[]                │
│    Adopt unrooted words via derived[] backlinks              │
│    Fallback: group remaining by stem prefix                  │
│                                                              │
│  Phase E: detect_compound() per word                         │
│    Kaikki compound templates or "X + Y" etymology patterns   │
│                                                              │
│  Phase F: resolve_compound_links()                           │
│    Map compound part lemmas → wort IDs for bridge drawing    │
│                                                              │
│  Output: game/public/ontology.json                           │
└─────────────────────────────────────────────────────────────┘
```

### What the Pipeline Produces (Current Stats)

- **635 words** in 333 root clusters
- **82 multi-word clusters** (2+ words sharing a root)
- **48 compound links** detected
- All A1-A2 content words (nouns, verbs, adjectives, adverbs)

### Pipeline Scripts Still Planned (Phase 0.5)

| Script | Purpose | Priority |
|--------|---------|----------|
| `decompose-morphology.py` | Colour-coded segment breakdown (prefix/root/suffix) | High — needed for success criterion #2 |
| `build-affixes.py` | Extract German affix inventory with semantic functions | Medium |
| `validate-ontology.py` | Schema validation + integrity checks | Low |

---

# 8. 3D Scene Architecture

## 8.1 Scene Setup (Implemented)

| Component | Specification | Status |
|-----------|--------------|--------|
| Renderer | WebGLRenderer, `antialias: true`, `pixelRatio: min(dpr, 2)`, PCFSoftShadowMap | ✅ Done |
| Camera | PerspectiveCamera, FOV 60, MapControls spherical offset | ✅ Done |
| Lighting | 1 AmbientLight (white, 0.6) + 1 DirectionalLight (warm, 0.8, shadows) | ✅ Done |
| Background | Sky blue (`#87CEEB`) | ✅ Done |
| Fog | `THREE.Fog(0x87CEEB, 80, 200)` | ✅ Done |
| Ground | `PlaneGeometry(500, 500)`, MeshStandard, blue-grey ocean | ✅ Done |

## 8.2 World Generation (Implemented)

### Step 1: Island Placement (Grid Layout)

- **Input:** Root clusters from `ontology.json`
- **Algorithm:** Simple grid layout. `GRID_SPACING = 25` world units between centres.
- **Island radius:** Proportional to word count: `min(8, max(3, wordCount * 0.8 + 2))`
- **Output:** `Island[]` with world positions

> **Not yet implemented:** Force-directed layout (Fruchterman-Reingold). Grid works for the prototype but doesn't convey semantic relationships. Planned for Phase 0.5.

### Step 2: Island Mesh Generation

Each island is a `THREE.Group` containing:
1. **Base cylinder** — `CylinderGeometry(radius, radius*1.2, 2, 16)`, dark sea green, flat shading, shadows
2. **Root label** — Canvas-based text sprite above island centre, font 48px, dark colour
3. **Word pillars** — `BoxGeometry(0.4, 1.5, 0.4)` arranged in a circle at 60% of island radius. Each pillar stores `{ type: 'word', wort }` in `userData` for raycasting.
4. **Word labels** — Canvas text sprites above each pillar, font 32px

### Step 3: Bridge Mesh Generation

- `BoxGeometry(0.8, 0.3, length)` connecting island centres
- Compound label sprite at midpoint
- Only created between islands that share compound words

### Not Yet Implemented

| Feature | Plan | Priority |
|---------|------|----------|
| **POS-specific meshes** | Nouns=cubes, Verbs=diamonds, Adj=spheres, Adv=tetrahedra | Medium |
| **Terrain displacement** | Perlin noise vertex displacement on ground plane | Low |
| **Path markers** | Instanced small spheres between root and word objects | Low |
| **Vertex colours** | Height-based colour lerp on terrain | Low |

---

# 9. Interaction System (Implemented)

## 9.1 Raycasting

- On pointer-up, check if pointer moved < 8px from pointer-down (tap vs. drag)
- If tap: raycast from camera through pointer position into scene
- Walk up parent chain of hit object to find `userData.type === 'word'` or `name.startsWith('island-')`

## 9.2 Object Interaction

| Action | Effect | Status |
|--------|--------|--------|
| Tap word pillar | Show word info card (lemma, POS, CEFR, IPA, definition, root, compound) | ✅ Done |
| Tap island (not a word) | Fly camera to island + show island overview card with clickable word list | ✅ Done |
| Tap word in island card | Switch to that word's detail card | ✅ Done |
| Tap empty space | Dismiss card | ✅ Done |
| Press Escape | Dismiss card | ✅ Done |
| Hover over word | Scale-up + emissive glow | ❌ Not done |

## 9.3 Word Card (HTML Overlay)

The `WordCard` class (`ui/word-card.ts`) manages a floating HTML card anchored at viewport bottom-center. Features:

**Word Detail View (`showWord`):**
- Lemma in large type (1.6rem, bold)
- POS tag (styled pill)
- CEFR level badge (colour-coded: A1=green → C2=red)
- IPA transcription (if available)
- English definition
- Compound decomposition display (if applicable)
- Root information (form + origin language + proto-form)

**Island Overview View (`showIsland`):**
- Root form + origin language as header
- Proto-form and meaning if available
- Clickable word list (each word shows lemma + CEFR badge + definition)
- Click any word → switches to its detail view

**Styling:**
- Glassmorphism: `backdrop-filter: blur(12px)`, white background with 95% opacity
- Box shadow, 16px border radius
- Slide-up entry animation (250ms, ease-out)
- Slide-down exit animation (200ms)
- Close button (top-right `×`)
- All styles injected via `<style>` tag on first use (no CSS file)

### Not Yet Implemented

| Feature | Priority |
|---------|----------|
| Morphological decomposition with colour-coded segments (prefix=blue, root=green, suffix=amber) | **High** |
| Etymology chain timeline view (vertical NHG → MHG → OHG → PGmc → PIE) | **High** |
| Source citations (DWDS, Wiktionary links) | Medium |
| Cognates section | Low |

---

# 10. Search & Navigation

## 10.1 Search Bar — Not Yet Implemented

**Planned:**
- HTML input, fixed at top of viewport, toggled by icon
- Prefix match + umlaut transliteration (ue→ü, ae→ä, oe→ö, ss→ß)
- Max 8 autocomplete results
- Select result → camera flies to word → word card auto-opens

**Dependencies:**
- Needs an `OntologyStore` class with `searchLemma(query)` method (or a simple Map-based index)
- Camera fly-to is already implemented (`CameraController.focusOn()`)

**Priority:** High — success criterion #4.

---

# 11. Performance

## 11.1 Current Performance

| Metric | Desktop Chrome | Mobile Chrome | Target |
|--------|---------------|---------------|--------|
| Frame rate | ~60 fps | ~45-60 fps | ✅ 60 / 30+ |
| Initial load | ~1-2s | ~2-3s | ✅ < 3s |
| Bundle size | ~517KB JS | same | ⚠️ Target was < 300KB |
| `ontology.json` | ~400KB | same | ✅ < 800KB |

## 11.2 Known Issues

1. **Bundle size (517KB)** — Three.js is the bulk. Could use code-splitting or dynamic imports for the addons. Not critical for Phase 0.
2. **Canvas-based text sprites** — Each word creates a 512×256 canvas. For 600+ words, this is significant texture memory. Consider shared sprite sheets or CSS2DRenderer for Phase 0.5.
3. **No render-on-demand** — Currently renders every frame even when nothing is moving. Adding a dirty flag would save battery on mobile.
4. **No instanced rendering** — Word pillars are individual meshes. For 600+ words, instanced rendering would reduce draw calls.

---

# 12. Module Architecture (Actual)

## 12.1 Module List

| Module | File | Responsibility | Lines |
|--------|------|---------------|-------|
| main | `main.ts` | Entry point, orchestrate init, interaction wiring, render loop | ~210 |
| types | `types/ontology.ts` | Wurzel, Wort, RootCluster, CompoundLink | ~50 |
| types | `types/world.ts` | Island, Bridge, WorldLayout | ~30 |
| loader | `data/loader.ts` | Fetch + filter `ontology.json` | ~70 |
| mock | `data/mock.ts` | Example clusters for offline dev | ~130 |
| renderer | `scene/renderer.ts` | WebGL renderer, camera, lights, ground, resize | ~85 |
| layout | `world/layout.ts` | Grid layout computation | ~70 |
| island | `world/island.ts` | Island mesh + word pillars + text sprites | ~120 |
| bridge | `world/bridge.ts` | Bridge mesh + label | ~85 |
| camera | `player/camera.ts` | CameraController (MapControls + WASD + fly-to) | ~150 |
| input | `player/input.ts` | Keyboard state tracking | ~65 |
| word-card | `ui/word-card.ts` | HTML overlay for word/island info | ~420 |

**Total: ~1,500 lines of TypeScript.**

## 12.2 Initialisation Sequence

```typescript
async function main() {
  // 1. Scene infrastructure (sync)
  const ctx = createSceneContext(container);

  // 2. Camera + input (sync)
  const cameraCtrl = new CameraController(ctx.camera, ctx.renderer.domElement);
  const keyboard = createKeyboardState();
  bindKeyboard(keyboard);

  // 3. UI components (sync)
  const wordCard = new WordCard(container);

  // 4. Load ontology data (async, ~200ms-1s)
  const { clusters } = await loadOntology({ minClusterSize: 2, maxClusters: 200 });

  // 5. Build world from clusters (sync, ~50ms)
  const layout = computeGridLayout(clusters);
  for (const island of layout.islands) ctx.scene.add(createIslandMesh(island));
  for (const bridge of layout.bridges) ctx.scene.add(createBridgeMesh(bridge, islandMap));

  // 6. Wire interactions (sync)
  // ... raycasting, tap detection, card show/hide ...

  // 7. Start render loop
  function animate() {
    requestAnimationFrame(animate);
    cameraCtrl.update(keyboard, ctx.clock.getDelta());
    ctx.renderer.render(ctx.scene, ctx.camera);
  }
  animate();
}
```

## 12.3 Planned Modules (Not Yet Created)

| Module | File | Purpose |
|--------|------|---------|
| OntologyStore | `data/OntologyStore.ts` | Index ontology data for search + query |
| SearchBar | `ui/SearchBar.ts` | HTML search input with autocomplete |
| EtymologyView | `ui/EtymologyView.ts` | Etymology chain timeline display |
| EntityFactory | `entities/EntityFactory.ts` | POS-specific mesh creation |
| InteractionManager | `entities/InteractionManager.ts` | Extract raycasting from main.ts |
| noise | `utils/noise.ts` | Perlin/simplex noise for terrain |

---

# 13. Remaining Work — Priority Order

## 13.1 High Priority (Complete the Prototype)

These items are needed to satisfy the success criteria and make the prototype "feel complete."

| # | Task | Estimated Effort | Success Criterion |
|---|------|-----------------|-------------------|
| H1 | **Search bar** — text input, autocomplete, camera fly-to + auto-open card | 3-4h | #4 |
| H2 | **Morphological decomposition display** — colour-coded prefix/root/suffix segments on word card | 3-4h | #2 |
| H3 | **Etymology chain view** — vertical timeline on island card (NHG → MHG → OHG → PGmc → PIE) | 3-4h | #3 |
| H4 | **Source citations** — DWDS + Wiktionary links on cards | 1-2h | #7 |
| H5 | **Ontology data enrichment** — add morphological segments + etymology chains to `export-ontology.py` output | 4-6h | #2, #3 |

## 13.2 Medium Priority (Visual Quality + Feel)

These improve the experience but aren't strictly required for the success criteria.

| # | Task | Estimated Effort |
|---|------|-----------------|
| M1 | **POS-specific meshes** — different shapes/colours for nouns, verbs, adjectives, adverbs | 2h |
| M2 | **Force-directed layout** — replace grid with Fruchterman-Reingold to show semantic relationships | 3-4h |
| M3 | **Hover effects** — scale-up + emissive glow when mouse/finger nears a word object | 1-2h |
| M4 | **OntologyStore class** — proper indexing for search and cross-referencing | 2-3h |
| M5 | **Extract InteractionManager** — move raycasting logic out of `main.ts` into its own module | 1-2h |

## 13.3 Low Priority (Polish)

| # | Task | Estimated Effort |
|---|------|-----------------|
| L1 | **Terrain generation** — Perlin noise displacement + vertex colours | 2-3h |
| L2 | **Path markers** — instanced small spheres between root monument and word objects | 1h |
| L3 | **Focus point marker** — glowing ring on ground showing camera target | 30min |
| L4 | **Render-on-demand** — skip frames when nothing is moving | 1-2h |
| L5 | **Instanced rendering** — batch word pillars into InstancedMesh | 1-2h |
| L6 | **Virtual joystick** — mobile on-screen joystick (if MapControls pan isn't enough) | 2h |
| L7 | **Validate ontology** — `validate-ontology.py` with integrity checks | 2h |
| L8 | **Code splitting** — lazy-load Three.js addons to reduce bundle size | 1h |

## 13.4 Suggested Next Sprint

**Sprint goal:** Make the word cards informative enough to prove the educational value.

1. **H5** — Enrich `export-ontology.py` to output morphological segments and etymology chains
2. **H2** — Render colour-coded segments on word card
3. **H3** — Render etymology timeline on island card
4. **H1** — Search bar with autocomplete
5. **H4** — Source citation links
6. **M1** — POS-specific meshes (quick visual improvement)

After this sprint, all 9 success criteria should be met.

---

# 14. Risk Register

| Risk | Severity | Likelihood | Mitigation | Status |
|------|----------|------------|------------|--------|
| Kaikki `etymology_templates[]` coverage too low | High | Medium | Cross-reference with `etymology_text`. Fall back to manual. Even 300 entries prove concept. | ✅ Mitigated — 82 multi-word clusters extracted |
| Automated morphological decomposition quality too low | High | Medium | Use Kaikki `derived[]`, `literal_meaning`, known affix patterns. Manual verification for gaps. | ⚠️ Open — decomposition not yet implemented |
| Navigation model doesn't feel like exploration | High | Low | MapControls + WASD + fly-to. Multiple tuning knobs. | ✅ Mitigated — feels spatial |
| Force-directed layout produces ugly clusters | Medium | Medium | Grid layout for now. Force-directed later with tuning. | ✅ Mitigated — grid works |
| Mobile performance below 30 fps | Low | Low | Scene is lightweight. MapControls battle-tested on mobile. | ✅ Mitigated — 45-60 fps on mobile |
| Docker environment issues on different host OSes | Medium | Low | Standard base image, standard tools. | ✅ Mitigated — tested on Linux |
| Bundle size too large for mobile | Low | Medium | Currently 517KB. Could code-split. Not critical for Phase 0. | ⚠️ Acceptable |
| Canvas texture memory for 600+ word labels | Medium | Medium | Each word creates a 512×256 canvas texture. Consider CSS2DRenderer or sprite sheets. | ⚠️ Open |

---

# 15. Open Questions (Deferred to Phase 1+)

1. **"Peaceful respite" vs. "game" narrative tension.** Phase 0 implements both contemplation (exploration) and game mechanics (discovery + decomposition display) minimally. Phase 1 develops an overarching narrative that reconciles them.
2. **Root granularity.** Is Licht the same root as leicht? For Phase 0, follow Wiktionary's grouping. Phase 1 adds a "synchronic transparency" score.
3. **Ablaut handling.** sprech-/sprach-/sproch- treated as allomorphs of a single root. Documented but not deeply modelled.
4. **Compound recursion depth.** Phase 0 handles one level of compounding. Recursive decomposition (Donaudampfschifffahrtsgesellschaftskapitän) is Phase 1.
5. **Dialect variants.** Not addressed. Phase 3+.
6. **Semantic drift.** Not modelled. Phase 1 can add meaning-evolution per etymology stage.
7. **Graph database migration.** SQLite works for 600 lexemes. Neo4j or similar for Phase 1 (2,000+ lexemes with complex traversals).
8. **WFC world generation.** Phase 1 replaces grid with Wave Function Collapse for richer terrain.
9. **Audio integration.** Phase 1-2: pronunciation playback, ambient soundscapes.
10. **SRS integration.** Phase 1-2: hidden spaced repetition engine driving exploration incentives.
11. **Compound bridge walking animation.** Phase 0 shows compound decomposition on word cards + flat bridges. Phase 1 adds 3D bridge crossing with visual decomposition animation.
12. **CSS2DRenderer vs canvas sprites.** Current approach creates individual canvas textures per word label. May need to switch to CSS2DRenderer or shared sprite atlases for scale.

---

# 16. Definition of Done

Phase 0 is complete and ready for Phase 1 handoff when ALL of these are true:

- [x] **Docker environment:** `docker compose up` starts dev environment. No host install needed.
- [x] **3D world:** Navigable world with root islands and word objects placed from ontology data.
- [x] **Navigation:** MapControls pan/orbit/zoom + WASD + fly-to-island. Works on desktop and mobile.
- [x] **Word card:** Tap word → info card with lemma, POS, CEFR, IPA, definition, root info.
- [x] **Island card:** Tap island → overview with root info + clickable word list.
- [x] **Real data:** 600+ words from A1-A2 vocabulary loaded from ontology.json.
- [x] **GitHub Pages:** Live at public URL. CI/CD via GitHub Actions.
- [x] **Performance:** 60 fps desktop, 30+ fps mobile, load < 3s.
- [ ] **Morphological decomposition:** Colour-coded prefix/root/suffix segments on word card.
- [ ] **Etymology chain:** Vertical timeline display (NHG → ... → PIE) on root/island view.
- [ ] **Search:** Type a German word → camera navigates to it, word card opens.
- [ ] **Source links:** Every word card has clickable DWDS/Wiktionary citations.
- [ ] **Data quality:** Spot-check of 50 random entries: ≤5 errors.

---

# Appendix A: Changelog

| Date | Change |
|------|--------|
| 2026-03-09 | Initial plan created from game_design.md, ontology_spec.md, user clarifications |
| 2026-03-15 | **Major update:** Added progress tracking to all sections. Updated repository structure to match actual codebase. Documented architecture divergences from original plan (simpler, fewer files). Added D18-D21 decisions. Updated navigation section to reflect MapControls implementation. Updated data pipeline section to reflect single export-ontology.py. Added "Remaining Work" section with prioritised task list. Updated Definition of Done with checkboxes. Added changelog. |
