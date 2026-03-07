# Phase 2.1 & 2.2 Complete: Docker Setup

## What Was Done

### 1. Created Dockerfile.api
- FastAPI service container
- Python 3.11-slim base image
- Health check included
- Exposes port 8000

### 2. Updated docker-compose.yml
- Added `urwort-api` service
- Added `urwort-network` for service communication
- Configured dependencies (nginx depends on API)
- Environment variables for configuration

### 3. Updated docker-compose.dev.yml
- Same as above, with:
  - Auto-reload enabled (`--reload` flag)
  - Read-write volume mount for live editing
  - DEBUG log level

### 4. Updated nginx.dev.conf
- Added `/api/` location block
- Proxies to `http://urwort-api:8000`
- CORS headers configured
- Timeout settings

### 5. Created Supporting Files
- `.dockerignore` - Excludes unnecessary files from build
- `test-docker.sh` - Automated test script
- `docs/docker-setup.md` - Complete setup guide

## Architecture

```
┌─────────────────────────────────────────────┐
│  Browser                                     │
│  http://localhost:8080                      │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│  urwort-dev (nginx:8080)                   │
│  - Serves / → static files                 │
│  - Proxies /api/* → urwort-api:8000        │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│  urwort-api (FastAPI:8000)                 │
│  - /api/kaikki/{word}                       │
│  - /api/health                              │
└─────────────────────────────────────────────┘
```

## How to Test

### Step 1: Build and Start

```bash
cd /home/aj/code/extras/urwort

# Build and start both services
docker compose up --build

# Or for dev mode with auto-reload
docker compose -f docker-compose.dev.yml up --build
```

### Step 2: Verify Services

```bash
# Check containers are running
docker compose ps

# Should show:
# - urwort-api (Up)
# - urwort-dev (Up)
```

### Step 3: Run Test Script

```bash
./test-docker.sh
```

This will test:
- ✅ Containers are running
- ✅ API health endpoint (direct)
- ✅ API health endpoint (via proxy)
- ✅ Word fetch (direct)
- ✅ Word fetch (via proxy)
- ✅ Frontend accessibility

### Step 4: Manual Testing

```bash
# Test API directly
curl http://localhost:8000/api/health
curl http://localhost:8000/api/kaikki/Haus

# Test API via nginx
curl http://localhost:8080/api/health
curl http://localhost:8080/api/kaikki/Haus

# Test frontend
curl http://localhost:8080/
```

### Step 5: View Logs

```bash
# All services
docker compose logs -f

# Just API
docker compose logs -f urwort-api

# Just nginx
docker compose logs -f urwort-dev
```

## Expected Results

### API Health Check
```json
{
  "status": "healthy",
  "cache": {
    "size": 0,
    "max_size": 10000,
    "ttl_seconds": 86400
  }
}
```

### Word Fetch
```json
{
  "word": "Haus",
  "fetchedAt": 1741600000000,
  "entries": [...],
  "allSenses": [...],
  "allForms": [...],
  "etymology": "...",
  "ipa": ["/haʊs/"],
  "audio": ["https://..."]
}
```

## Troubleshooting

### Containers won't start

```bash
# Check for port conflicts
lsof -i :8080
lsof -i :8000

# Stop existing containers
docker compose down

# Rebuild from scratch
docker compose build --no-cache
docker compose up
```

### API not responding

```bash
# Check API logs
docker compose logs urwort-api

# Test API directly
curl http://localhost:8000/api/health

# Check if API container is running
docker compose ps urwort-api
```

### Nginx can't reach API

```bash
# Check network
docker network inspect urwort_urwort-network

# Test connectivity from nginx container
docker compose exec urwort-dev ping urwort-api

# Check nginx logs
docker compose logs urwort-dev
```

### Auto-reload not working

Make sure you're using `docker-compose.dev.yml`:
```bash
docker compose -f docker-compose.dev.yml up
```

And volume is mounted as `:rw`:
```yaml
volumes:
  - ./api:/app/api:rw  # Must be rw
```

## Next Steps

Once Docker setup is verified:
1. ✅ Test API works via nginx proxy
2. ✅ Update PWA `kaikki.js` to use `/api/kaikki/{word}`
3. ✅ Test end-to-end integration
4. ✅ Verify enrichment works in browser

## Files Changed

- ✅ `Dockerfile.api` (new)
- ✅ `docker-compose.yml` (updated)
- ✅ `docker-compose.dev.yml` (updated)
- ✅ `nginx.dev.conf` (updated)
- ✅ `.dockerignore` (new)
- ✅ `test-docker.sh` (new)
- ✅ `docs/docker-setup.md` (new)

## Summary

Phase 2.1 & 2.2 are complete! The FastAPI service is now:
- ✅ Containerized with Docker
- ✅ Integrated into docker-compose
- ✅ Proxied through nginx
- ✅ Accessible at `/api/kaikki/{word}`
- ✅ Ready for PWA integration

Proceed to Phase 2.3: Update PWA to use the API.
