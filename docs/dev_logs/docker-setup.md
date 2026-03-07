# Docker Setup Guide

## Overview

The urwort project now runs in Docker with two services:
1. **urwort-dev** (nginx) - Serves the PWA static files
2. **urwort-api** (FastAPI) - Provides kaikki.org enrichment API

## Quick Start

### Development Mode (with auto-reload)

```bash
# Start both services
docker compose -f docker-compose.dev.yml up --build

# Or use the default (same as dev)
docker compose up --build
```

This will:
- Build both containers
- Start nginx on port 8080
- Start FastAPI on port 8000 (also accessible directly)
- Enable auto-reload for API code changes
- Mount volumes for live editing

### Access the Services

- **PWA Frontend**: http://localhost:8080
- **API Direct**: http://localhost:8000
- **API via Nginx**: http://localhost:8080/api/kaikki/{word}

### Test the Setup

```bash
# Test API directly
curl http://localhost:8000/api/health

# Test API via nginx proxy
curl http://localhost:8080/api/kaikki/Haus

# Test PWA frontend
curl http://localhost:8080/
```

## Service Details

### urwort-api (FastAPI)

- **Port**: 8000 (exposed for direct testing)
- **Image**: `urwort-api:dev`
- **Container**: `urwort-api`
- **Volume**: `./api:/app/api` (rw in dev, ro in default)
- **Auto-reload**: Enabled in dev mode
- **Health check**: Built-in at `/api/health`

### urwort-dev (Nginx)

- **Port**: 8080
- **Image**: `urwort:dev`
- **Container**: `urwort-dev`
- **Volume**: `./src:/usr/share/nginx/html` (read-only)
- **Proxy**: `/api/*` → `http://urwort-api:8000`

## Development Workflow

### Making API Changes

1. Edit files in `api/` directory
2. FastAPI auto-reloads (if using dev compose)
3. Test: `curl http://localhost:8080/api/kaikki/Haus`

### Making Frontend Changes

1. Edit files in `src/` directory
2. Refresh browser (nginx serves from volume)
3. No rebuild needed

### Viewing Logs

```bash
# All services
docker compose logs -f

# Just API
docker compose logs -f urwort-api

# Just nginx
docker compose logs -f urwort-dev
```

### Rebuilding

```bash
# Rebuild everything
docker compose build --no-cache

# Rebuild just API
docker compose build urwort-api

# Rebuild and restart
docker compose up --build
```

## Troubleshooting

### API not responding

```bash
# Check if container is running
docker compose ps

# Check API logs
docker compose logs urwort-api

# Test API directly
curl http://localhost:8000/api/health

# Check nginx can reach API
docker compose exec urwort-dev ping urwort-api
```

### Port already in use

```bash
# Find what's using the port
lsof -i :8080
lsof -i :8000

# Stop existing containers
docker compose down

# Or change ports in docker-compose.yml
```

### Auto-reload not working

Make sure you're using `docker-compose.dev.yml`:
```bash
docker compose -f docker-compose.dev.yml up
```

And that the volume is mounted as `:rw`:
```yaml
volumes:
  - ./api:/app/api:rw  # Must be rw for auto-reload
```

### Network issues

```bash
# Recreate network
docker compose down
docker network prune
docker compose up
```

## Production Setup

For production, use `docker-compose.prod.yml` (to be created):
- No auto-reload
- Read-only volumes
- Optimized builds
- Health checks
- Resource limits

## Environment Variables

Set in `docker-compose.yml`:

```yaml
environment:
  - KAIKKI_API_HOST=0.0.0.0
  - KAIKKI_API_PORT=8000
  - KAIKKI_CACHE_TTL=86400
  - KAIKKI_RATE_LIMIT_PER_MINUTE=100
  - LOG_LEVEL=INFO
```

## Next Steps

1. ✅ Test Docker setup
2. ✅ Verify API works via nginx proxy
3. ✅ Update PWA to use `/api/kaikki/{word}`
4. ✅ Test end-to-end integration
