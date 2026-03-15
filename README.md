# urwort — German-English Dictionary PWA

A progressive web app (PWA) for German-English dictionary lookup, built with vanilla JavaScript, IndexedDB, and a FastAPI backend for enrichment data.

## Features

- ⚡ **Fast search** — O(log n) prefix queries via IndexedDB
- 📱 **Offline-first** — Full dictionary works offline after initial seed
- 🔍 **Multi-source enrichment** — FreeDict core + kaikki.org (Wiktionary) data
- 🎨 **Modern UI** — Clean, responsive design
- 🚀 **PWA** — Installable, works like a native app

## Architecture

### Frontend (PWA)
- **Vanilla JavaScript** — No frameworks, no build step
- **IndexedDB (Dexie)** — Local database for instant search
- **Service Worker** — Offline support and caching
- **Three-layer data model**:
  - Layer 1: Search index (word, pos, gender, hint)
  - Layer 2: Full entries (translations, examples)
  - Layer 3: Enrichment (etymology, IPA, audio) — fetched from API

### Backend (FastAPI)
- **FastAPI server** — Lightweight Python API
- **kaikki.org integration** — Fetches and processes JSONL data
- **In-memory caching** — 24h TTL, LRU eviction
- **Rate limiting** — 100 requests/minute per IP

### Infrastructure
- **Docker Compose** — Two services:
  - `urwort-web` (nginx) — Serves PWA static files + proxies `/api/*`
  - `urwort-api` (FastAPI) — Enrichment API
- **Hetzner Cloud** — CX22 server + persistent volume for SQLite DB
- **Terraform + Ansible** — Provisioning and deployment via `infra/`

## Quick Start

### Prerequisites
- Docker and Docker Compose
- Python 3.11+ (for local API development)

### Development

```bash
# Clone the repository
git clone <repo-url>
cd urwort

# (First time) Build the SQLite database from raw-data/
docker compose -f infra/docker/docker-compose.dev.yml run --rm urwort-build

# Start all services
docker compose -f infra/docker/docker-compose.dev.yml up --build

# Access the app
# Frontend: http://localhost:8080
# API:      http://localhost:8000
```

### Testing

```bash
# Test API directly
curl http://localhost:8000/api/kaikki/Haus

# Test API via nginx proxy
curl http://localhost:8080/api/kaikki/Haus

# Run automated tests (from project root)
./test-docker.sh
```

## Project Structure

```
urwort/
├── api/                        # FastAPI backend
│   ├── main.py                # Routes
│   ├── db.py                  # SQLite connection helper
│   ├── dwds.py                # DWDS fetching/parsing
│   ├── enrichment.py          # Entry enrichment logic
│   ├── models.py              # Pydantic models
│   └── requirements.txt
├── src/                        # PWA frontend
│   ├── js/
│   │   ├── app.js             # Main app logic
│   │   ├── search.js          # Search functionality
│   │   ├── db.js              # IndexedDB (Dexie)
│   │   ├── dwds.js            # DWDS enrichment layer
│   │   └── ui.js              # UI rendering
│   ├── css/
│   └── index.html
├── tools/                      # Build scripts
│   ├── build-db.py            # SQLite DB builder (multi-source)
│   └── schema.sql             # Canonical DB schema
├── data/                       # Generated SQLite DB (gitignored)
├── raw-data/                   # Source data files (gitignored)
├── docs/                       # Documentation
└── infra/                      # Infrastructure & deployment
    ├── docker/                 # Dockerfiles, nginx configs, compose files
    │   ├── Dockerfile.web      # Dev nginx image
    │   ├── Dockerfile.web.prod # Prod nginx image (src/ baked in)
    │   ├── Dockerfile.api      # FastAPI image
    │   ├── Dockerfile.build    # DB builder image
    │   ├── nginx.dev.conf      # Dev nginx config
    │   ├── nginx.prod.conf     # Prod nginx config
    │   ├── docker-compose.dev.yml
    │   └── docker-compose.prod.yml
    ├── terraform/              # Hetzner Cloud provisioning
    ├── ansible/                # Server configuration & deployment
    ├── scripts/                # deploy.sh, deploy-frontend.sh
    ├── deploy-keys/            # SSH deploy key (urwort_ed25519)
    ├── Dockerfile.ops          # Ops toolbox image
    ├── docker-compose.ops.yml  # Launch ops container
    └── deploy.conf             # Server IP (read by CI)
```

## API Endpoints

### `GET /api/kaikki/{word}`

Fetch kaikki.org enrichment data for a German word.

**Example:**
```bash
curl http://localhost:8080/api/kaikki/Haus
```

**Response:**
```json
{
  "word": "Haus",
  "fetchedAt": 1741600000000,
  "entries": [...],
  "allSenses": [...],
  "allForms": [...],
  "etymology": "From Middle High German hūs...",
  "ipa": ["/haʊs/"],
  "audio": ["https://..."]
}
```

### `GET /api/health`

Health check with cache statistics.

## Configuration

### Environment Variables

```bash
# API Server
KAIKKI_API_HOST=0.0.0.0
KAIKKI_API_PORT=8000

# Caching
KAIKKI_CACHE_TTL=86400  # 24 hours
KAIKKI_CACHE_MAX_SIZE=10000

# Rate Limiting
KAIKKI_RATE_LIMIT_PER_MINUTE=100

# Logging
LOG_LEVEL=INFO
```

## Development Workflow

### Making Frontend Changes
1. Edit files in `src/`
2. Refresh browser (nginx serves from volume)
3. No rebuild needed

### Making API Changes
1. Edit files in `api/`
2. FastAPI auto-reloads (in dev mode)
3. Test: `curl http://localhost:8080/api/kaikki/Haus`

### Viewing Logs
```bash
COMPOSE="docker compose -f infra/docker/docker-compose.dev.yml"

# All services
$COMPOSE logs -f

# Just API
$COMPOSE logs -f urwort-api

# Just nginx
$COMPOSE logs -f urwort-web
```

## Data Flow

```
User types "sch..."
  ↓
IndexedDB query (O(log n))
  ↓
Results displayed (< 10ms)

User clicks word
  ↓
Check IndexedDB cache
  ↓
If miss: fetch from /data/{dir}/data/{letter}.json
  ↓
Render detail view
  ↓
Background: fetch /api/kaikki/{word}
  ↓
Merge into entry.sources.kaikki
  ↓
Save to IndexedDB
  ↓
Re-render with enrichment data
```

## Performance

| Metric | Target | Actual |
|--------|--------|--------|
| Search latency | < 10ms | ~5-10ms |
| Detail view (cached) | < 80ms | ~2ms |
| API response (cached) | < 50ms | ~10-30ms |
| API response (miss) | < 500ms | ~200-400ms |

## Documentation

- [Architecture v2](docs/architecture-v2.md) — System design
- [API Design](docs/dev_logs/kaikki-api-design.md) — API specification
- [Docker Setup](docs/dev_logs/docker-setup.md) — Container configuration
- [Data Pipeline](docs/data-pipeline.md) — Dictionary build process

## License

[Add your license here]

## Contributing

[Add contribution guidelines here]
