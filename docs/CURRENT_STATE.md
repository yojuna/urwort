# Current State — urwort Project

**Last Updated:** 2024

## Overview

urwort is a German-English dictionary PWA with a FastAPI backend for enrichment data. The system is fully functional with Docker-based deployment.

## System Components

### 1. Frontend PWA (`src/`)

**Technology:**
- Vanilla JavaScript (no frameworks)
- IndexedDB via Dexie.js
- Service Worker for offline support
- Progressive Web App (PWA)

**Key Files:**
- `src/js/app.js` — Main application logic
- `src/js/search.js` — Search functionality (IndexedDB queries)
- `src/js/kaikki.js` — API integration for enrichment
- `src/js/db.js` — IndexedDB schema and operations
- `src/js/ui.js` — UI rendering
- `src/sw.js` — Service Worker

**Data Flow:**
1. User searches → IndexedDB query (Layer 1)
2. User opens word → Check IndexedDB cache (Layer 2)
3. Background enrichment → API call to `/api/kaikki/{word}` (Layer 3)

### 2. FastAPI Backend (`api/`)

**Technology:**
- FastAPI (Python 3.11+)
- httpx for HTTP requests
- In-memory caching with TTL
- Rate limiting (slowapi)

**Key Files:**
- `api/main.py` — FastAPI app and routes
- `api/kaikki.py` — kaikki.org fetching and JSONL parsing
- `api/cache.py` — In-memory TTL cache
- `api/models.py` — Pydantic models
- `api/config.py` — Configuration

**Endpoints:**
- `GET /api/kaikki/{word}` — Fetch enrichment data
- `GET /api/health` — Health check
- `GET /` — API info

**Features:**
- Fetches JSONL from kaikki.org (server-side, no CORS)
- Parses and transforms to PWA format
- Caches responses (24h TTL)
- Rate limiting (100 req/min)

### 3. Infrastructure

**Docker Compose Services:**

1. **urwort-dev** (nginx)
   - Port: 8080
   - Serves: PWA static files from `src/`
   - Proxies: `/api/*` → `urwort-api:8000`
   - Volume: `./src:/usr/share/nginx/html:ro`

2. **urwort-api** (FastAPI)
   - Port: 8000 (exposed for direct testing)
   - Serves: Enrichment API
   - Volume: `./api:/app/api:rw` (dev mode, auto-reload)
   - Network: `urwort-network` (shared with nginx)

**Network Architecture:**
```
Browser → nginx:8080 → /api/* → FastAPI:8000 → kaikki.org
         ↓
      / (static files)
```

## Current Status

### ✅ Completed

- [x] FastAPI backend implementation
- [x] kaikki.org JSONL fetching and parsing
- [x] In-memory caching with TTL
- [x] Rate limiting
- [x] Docker containerization
- [x] Nginx proxy configuration
- [x] Frontend integration (CORS resolved)
- [x] End-to-end data flow working

### 🔄 In Progress

- [ ] Production deployment configuration
- [ ] Redis caching (optional, for multi-instance)
- [ ] Monitoring and metrics
- [ ] Error tracking

### 📋 Future Enhancements

- [ ] Batch API endpoint for multiple words
- [ ] WebSocket support for real-time updates
- [ ] Background job for pre-fetching popular words
- [ ] Multi-language support beyond German
- [ ] CDN caching at edge

## Data Sources

### FreeDict (Core Dictionary)
- **Source:** FreeDict project
- **Format:** JSON chunks per letter
- **Storage:** IndexedDB (Layer 1 & 2)
- **Coverage:** de-en, en-de

### kaikki.org (Enrichment)
- **Source:** kaikki.org (Wiktionary data)
- **Format:** JSONL
- **Storage:** IndexedDB (Layer 3, via API)
- **Coverage:** de-en only
- **Data:** Etymology, IPA, audio, senses, forms

## Performance Metrics

### Search Performance
- **IndexedDB query:** ~5-10ms (O(log n))
- **First search (cold):** < 10ms (after seeding)
- **Subsequent searches:** < 10ms

### API Performance
- **Cache hit:** < 50ms
- **Cache miss:** 200-500ms (fetch from kaikki.org)
- **P95 latency:** < 800ms
- **P99 latency:** < 1500ms

### Storage
- **IndexedDB index:** ~40 MB (Layer 1)
- **IndexedDB data:** Lazy loaded (Layer 2)
- **API cache:** ~100 KB per entry (in-memory)

## Configuration

### Environment Variables

**API Service:**
```bash
KAIKKI_API_HOST=0.0.0.0
KAIKKI_API_PORT=8000
KAIKKI_CACHE_TTL=86400
KAIKKI_CACHE_MAX_SIZE=10000
KAIKKI_RATE_LIMIT_PER_MINUTE=100
LOG_LEVEL=INFO
```

### Docker Compose

**Development:**
```bash
docker compose -f docker-compose.dev.yml up
```

**Default:**
```bash
docker compose up
```

## Testing

### Manual Testing

```bash
# Test API directly
curl http://localhost:8000/api/kaikki/Haus

# Test API via nginx
curl http://localhost:8080/api/kaikki/Haus

# Test frontend
# Open http://localhost:8080 in browser
```

### Automated Testing

```bash
# Run test script
./test-docker.sh
```

## Troubleshooting

### CORS Errors
- ✅ **Resolved:** Frontend now uses `/api/kaikki/{word}` (relative URL)
- ✅ **Resolved:** Nginx handles CORS headers and preflight

### API Not Responding
```bash
# Check containers
docker compose ps

# Check logs
docker compose logs urwort-api

# Test connectivity
docker compose exec urwort-dev ping urwort-api
```

### Data Not Appearing
1. Check browser console for errors
2. Check IndexedDB (DevTools → Application → IndexedDB)
3. Verify API response: `curl http://localhost:8080/api/kaikki/Haus`

## Deployment

### Development
- Docker Compose with volume mounts
- Auto-reload enabled
- Debug logging

### Production (Future)
- Optimized Docker images
- Read-only volumes
- Resource limits
- Health checks
- Monitoring

## Documentation

- [Architecture v2](architecture-v2.md) — System design
- [API Design](dev_logs/kaikki-api-design.md) — API specification
- [Docker Setup](dev_logs/docker-setup.md) — Container configuration
- [Data Pipeline](data-pipeline.md) — Dictionary build process

## Git Status

All changes are ready to commit:
- ✅ FastAPI backend implementation
- ✅ Docker configuration
- ✅ Frontend integration
- ✅ Documentation updates

## Next Steps

1. Test end-to-end integration thoroughly
2. Add production configuration
3. Set up monitoring
4. Deploy to production environment
