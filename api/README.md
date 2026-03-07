# Kaikki API Backend

FastAPI server for fetching and processing kaikki.org dictionary data.

## Quick Start

### Install Dependencies

```bash
cd api
pip install -r requirements.txt
```

### Run the Server

```bash
# Development mode (with auto-reload)
python -m api.main

# Or using uvicorn directly
uvicorn api.main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at `http://localhost:8000`

### Test the API

```bash
# Test with curl
curl http://localhost:8000/api/kaikki/Haus

# Health check
curl http://localhost:8000/api/health

# Root endpoint
curl http://localhost:8000/
```

### Test the Parsing Logic

```bash
# Test the kaikki parsing module directly
python -m api.test_api
```

## API Endpoints

### `GET /api/kaikki/{word}`

Fetch kaikki.org data for a word.

**Parameters:**
- `word` (path): German word (case-sensitive)
- `lang` (query, optional): Language code (default: "de")

**Example:**
```bash
curl "http://localhost:8000/api/kaikki/Haus?lang=de"
```

**Response:**
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

### `GET /api/health`

Health check endpoint with cache statistics.

### `GET /`

Root endpoint with API information.

## Configuration

Set environment variables:

```bash
export KAIKKI_API_HOST=0.0.0.0
export KAIKKI_API_PORT=8000
export KAIKKI_CACHE_TTL=86400  # 24 hours
export KAIKKI_RATE_LIMIT_PER_MINUTE=100
```

## Development

### Project Structure

```
api/
├── __init__.py
├── main.py          # FastAPI app and routes
├── kaikki.py        # kaikki.org fetching & parsing
├── cache.py         # In-memory caching
├── models.py        # Pydantic models
├── config.py        # Configuration
├── requirements.txt
└── test_api.py      # Test script
```

### Testing

1. **Test parsing logic:**
   ```bash
   python -m api.test_api
   ```

2. **Test API server:**
   ```bash
   # Start server
   uvicorn api.main:app --reload
   
   # In another terminal
   curl http://localhost:8000/api/kaikki/Haus
   ```

## Docker Deployment

The API is containerized and integrated with Docker Compose:

```bash
# Start all services (nginx + API)
docker compose -f docker-compose.dev.yml up --build

# API accessible at:
# - Direct: http://localhost:8000
# - Via nginx: http://localhost:8080/api/kaikki/{word}
```

See [Docker Setup](../docs/dev_logs/docker-setup.md) for details.

## Integration

✅ **Completed:**
- Docker support
- Nginx integration
- PWA updated to use API
- CORS resolved

📋 **Future:**
- Redis caching (optional, for multi-instance)
- Production optimizations
