# Urwort — German Root-Word Exploration Game

A contemplative 3D exploration game where the German language's root-word structure manifests as a navigable world. Discover morphological structure, trace etymological depth, and build intuition for how German words are constructed.

> *The world is the ontology. The map is the language.*

## Phase 0: Foundation

The current phase proves one hypothesis: **walking through a spatial representation of the German root-word ontology, tapping objects to discover morphological structure and etymological depth, is a compelling and educationally sound experience.**

- **500 lexemes** (A1–A2 core vocabulary)
- **~150–200 unique roots** with etymology chains back to PGmc/PIE
- **3D navigable terrain** with root monuments and word-objects
- **Tap-to-inspect** morphological decomposition + etymological history
- **Source-linked** — every claim links to DWDS, Wiktionary, or academic sources

## Quick Start

```bash
# Prerequisites: Docker

# Start the dev container
docker compose up -d dev
docker compose exec dev bash

# Build ontology data
python3 tools/build-db.py
python3 tools/select-vocabulary.py
python3 tools/extract-etymology.py
python3 tools/decompose-morphology.py
python3 tools/build-affixes.py
python3 tools/export-ontology.py

# Start the game
cd game && npm install && npm run dev
# Open http://localhost:5173
```

## Project Structure

```
urwort/
├── game/               # Three.js game client (TypeScript + Vite)
├── tools/              # Data pipeline scripts (Python)
│   ├── build-db.py     # FreeDict + Kaikki + IPA + CEFR → SQLite
│   └── schema.sql      # Database schema
├── api/                # FastAPI server (enrichment + ontology endpoints)
├── raw-data/           # Source data (gitignored, ~3GB)
├── data/               # Build outputs (gitignored)
└── docs/               # Design specifications
    ├── phase0_implementation_plan.md  # Current implementation plan
    ├── game_design.md                 # Game vision & mechanics
    ├── ontology_spec.md               # Data model specification
    └── knowledge_base.md              # Resource compendium
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Game client | TypeScript, Three.js, Vite |
| Data pipeline | Python 3.11+, SQLite |
| API server | FastAPI, Uvicorn |
| Dev environment | Docker Compose |

## Documentation

- **[Implementation Plan](docs/phase0_implementation_plan.md)** — Phase 0 detailed plan (start here)
- **[Game Design](docs/game_design.md)** — Full game vision & mechanics spec
- **[Ontology Spec](docs/ontology_spec.md)** — Data model & entity schema
- **[Knowledge Base](docs/knowledge_base.md)** — German language resource inventory

## License

- **Code:** MIT
- **Ontology data:** CC BY-SA 4.0
