# Urwort — Dev Tooling

Everything runs inside a single Docker container. No host-level Node.js or Python required.

## Prerequisites

- Docker + Docker Compose
- Git (for deploy script)

## Quick Start

```bash
# Start the dev container and open a shell
./dev.sh

# Or start it in the background
./dev.sh up
```

Inside the container you get a colored prompt with project aliases:

```
[urwort] /workspace (main) $
```

The Vite dev server starts automatically at **http://localhost:5173** with HMR.

## Scripts

### `dev.sh` — Development environment

| Command | Description |
|---------|-------------|
| `./dev.sh` | Start container + open interactive bash shell |
| `./dev.sh shell` | Same as above (default) |
| `./dev.sh up` | Start container in background (no shell) |
| `./dev.sh down` | Stop container |
| `./dev.sh logs` | Tail container logs |
| `./dev.sh status` | Show container status and ports |
| `./dev.sh rebuild` | Force rebuild the container image |

### `deploy.sh` — Build & deploy to GitHub Pages

Runs the full pipeline inside the container:

1. **Export ontology** — `python3 tools/export-ontology.py` → `game/public/ontology.json`
2. **Build game** — `tsc` + `vite build` → `game/dist/`
3. **Commit** — auto-generated message with word/cluster counts
4. **Push** — to `main` + `pages-deploy` branch (triggers GitHub Actions)

```bash
./deploy.sh                  # full pipeline: export → build → push
./deploy.sh --skip-export    # skip ontology export, use existing JSON
./deploy.sh --dry-run        # build everything but don't push
```

The deploy script auto-starts the container if it's not running.

Output is colorised with progress indicators and timing for each step.

## Container Details

### Image

Based on `node:22-bookworm-slim` with Python 3, SQLite, and git added.

### User

Runs as the `node` user (UID 1000) which matches the default host user — files created inside the container have correct ownership on the host.

### Ports

| Port | Service |
|------|---------|
| 5173 | Vite dev server (game client) |
| 8000 | FastAPI (API server) |

### Volume Mounts

| Host path | Container path | Purpose |
|-----------|---------------|---------|
| `./game/` | `/workspace/game/` | Game client source (HMR) |
| `./api/` | `/workspace/api/` | API server source |
| `./tools/` | `/workspace/tools/` | Data pipeline scripts |
| `./data/` | `/workspace/data/` | SQLite database |
| `./raw-data/` | `/workspace/raw-data/` | Kaikki JSONL source files |
| *(docker volume)* | `/workspace/game/node_modules/` | Isolated node_modules |

The `node_modules` volume is managed by Docker to avoid host/container platform mismatches.

### Shell Aliases

Available inside the container:

| Alias | Expands to |
|-------|-----------|
| `export-ontology` | `cd /workspace && python3 tools/export-ontology.py` |
| `build` | `cd /workspace/game && npm run build` |
| `dev` | `cd /workspace/game && npm run dev` |
| `ll` | `ls -lah --color=auto` |

## Data Pipeline

### `tools/export-ontology.py`

Reads the SQLite dictionary DB + Kaikki JSONL files and produces `game/public/ontology.json`.

```bash
# Inside the container:
export-ontology

# Or from the host:
docker exec urwort-dev sh -c "cd /workspace && python3 tools/export-ontology.py"
```

The script outputs stats on completion:

```
───────────────────────────────────────────────────────
  Clusters total           : 1138
  Multi-word clusters (≥2) : 155 (368 words)
  Total words              : 1351
  Clusters with chain ≥2   : 759
  Words with segments      : 614 / 1351
───────────────────────────────────────────────────────
```

### `tools/build-db.py`

Builds the `data/urwort.db` SQLite database from the raw source files (FreeDict, Kaikki, IPA-dict, CEFR lists).

```bash
# Inside the container:
cd /workspace && python3 tools/build-db.py
```

## GitHub Pages Deployment

Deployment is handled by GitHub Actions (`.github/workflows/deploy-pages.yml`).

**Trigger:** push to the `pages-deploy` branch.

**What it does:**
1. Checks out the code
2. Installs dependencies (`npm ci`)
3. Builds with `VITE_BASE_PATH=/urwort/`
4. Deploys `game/dist/` to GitHub Pages

**Live URL:** https://yojuna.github.io/urwort/

The `deploy.sh` script handles pushing to `pages-deploy` automatically.

## Troubleshooting

### `EACCES: permission denied` on `game/dist/`

The `dist/` directory was created by a previous root-owned container. Fix:

```bash
# Remove the root-owned dist
docker run --rm -v "$(pwd)/game:/mnt" alpine sh -c "rm -rf /mnt/dist"

# Rebuild
docker exec urwort-dev sh -c "cd /workspace/game && npm run build"
```

### Container won't start

```bash
./dev.sh rebuild    # force rebuild the image
```

### node_modules issues

```bash
# Remove the volume and let it recreate
docker compose down
docker volume rm urwort_urwort_node_modules
docker compose up -d --build
```

### Search bar not working

Make sure `ontology.json` is up to date:

```bash
./deploy.sh  # or just: docker exec urwort-dev sh -c "cd /workspace && python3 tools/export-ontology.py"
```

The search indexes all 1351 words, not just the ones rendered as 3D islands.
