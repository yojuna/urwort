# Kaikki API Backend — Design Document

## Overview

A lightweight FastAPI server that fetches and processes JSONL data from kaikki.org, returning structured enrichment data that the PWA can merge into IndexedDB. This solves CORS issues by moving kaikki.org requests to the server-side.

---

## Architecture Principles

1. **Server-side proxy** — Fetches JSONL from kaikki.org (no CORS)
2. **Stateless API** — Each request is independent, no session state
3. **Fast response** — Target < 200ms for cache hits, < 500ms for cache misses
4. **Same data format** — Returns data in the exact format expected by `entry.sources.kaikki`
5. **Graceful degradation** — 404s and errors return structured responses, not crashes
6. **Minimal dependencies** — FastAPI, httpx, optional Redis for caching

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  PWA Client (Browser)                                           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  User opens word detail → checks entry.sources.kaikki    │  │
│  │  If missing → fetch /api/kaikki/{word}                   │  │
│  │  Merge response into entry.sources.kaikki                 │  │
│  │  Save to IndexedDB via DB.wordDataPut()                  │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP GET /api/kaikki/{word}
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  FastAPI Server (Port 8000)                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  1. Check in-memory cache (TTL: 24h)                    │  │
│  │  2. If miss → fetch from kaikki.org JSONL               │  │
│  │  3. Parse JSONL → transform to PWA format               │  │
│  │  4. Cache result → return JSON                           │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP GET
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  kaikki.org                                                     │
│  https://kaikki.org/dictionary/German/meaning/{f}/{f2}/{word}.jsonl │
└─────────────────────────────────────────────────────────────────┘
```

---

## API Endpoints

### `GET /api/kaikki/{word}`

Fetches and processes kaikki.org data for a German word.

**Path Parameters:**
- `word` (string, required): German word (e.g., "Haus", "Schule")
  - Case-sensitive (kaikki.org uses original casing)
  - URL-encoded automatically by FastAPI

**Query Parameters:**
- `lang` (string, optional): Language code, defaults to `"de"` (German)
  - Future: could support other languages

**Response Format:**

**Success (200 OK):**
```json
{
  "word": "Haus",
  "fetchedAt": 1741600000000,
  "entries": [
    {
      "word": "Haus",
      "pos": "noun",
      "etymology_number": 1,
      "senses": [
        {
          "glosses": ["house", "home", "building"],
          "raw_glosses": ["house", "home", "building"],
          "tags": ["neuter", "strong"],
          "links": [],
          "synonyms": ["Gebäude", "Wohnung"]
        }
      ],
      "forms": [
        {"form": "Hauses", "tags": ["genitive", "singular"]},
        {"form": "Häuser", "tags": ["nominative", "plural"]}
      ],
      "etymology_text": "From Middle High German hūs, from Old High German hūs...",
      "sounds": [
        {
          "ipa": "/haʊs/",
          "ogg_url": "https://upload.wikimedia.org/.../De-Haus.ogg",
          "mp3_url": "https://upload.wikimedia.org/.../De-Haus.ogg.mp3"
        }
      ]
    }
  ],
  "allSenses": [...],  // Flattened from all entries
  "allForms": [...],   // Deduplicated forms
  "etymology": "...",  // Combined etymology text
  "ipa": ["/haʊs/"],   // All IPA pronunciations
  "audio": ["https://..."]  // All audio URLs
}
```

**Not Found (404):**
```json
{
  "error": "word_not_found",
  "message": "Word 'Haus' not found in kaikki.org",
  "word": "Haus"
}
```

**Server Error (500):**
```json
{
  "error": "internal_error",
  "message": "Failed to fetch from kaikki.org: Connection timeout",
  "word": "Haus"
}
```

**Rate Limit (429):**
```json
{
  "error": "rate_limit_exceeded",
  "message": "Too many requests. Please try again later.",
  "retry_after": 60
}
```

---

## Data Transformation

### Input: kaikki.org JSONL Format

Each line is a JSON object:
```json
{
  "word": "Haus",
  "pos": "noun",
  "lang": "German",
  "lang_code": "de",
  "etymology_number": 1,
  "etymology_text": "From OHG hūs...",
  "senses": [
    {
      "glosses": ["house", "home"],
      "raw_glosses": ["house", "home"],
      "tags": ["neuter", "strong"],
      "links": [["Haus", "Haus#German"]],
      "synonyms": [{"word": "Gebäude"}]
    }
  ],
  "forms": [
    {"form": "Hauses", "tags": ["genitive", "singular"]}
  ],
  "sounds": [
    {
      "ipa": "/haʊs/",
      "ogg_url": "https://...",
      "mp3_url": "https://..."
    }
  ]
}
```

### Output: PWA-Compatible Format

Transformed to match `entry.sources.kaikki` structure:
```json
{
  "fetchedAt": 1741600000000,
  "entries": [...],  // Array of parsed entries
  "allSenses": [...],  // Flattened senses from all entries
  "allForms": [...],   // Deduplicated forms
  "etymology": "...",  // Combined etymology text
  "ipa": ["/haʊs/"],   // Array of IPA strings
  "audio": ["https://..."]  // Array of audio URLs
}
```

**Transformation Rules:**
1. **Multiple entries** (different etymologies/PoS) → combine into one response
2. **Senses** → flatten from all entries, preserve structure
3. **Forms** → deduplicate by `form` field
4. **Etymology** → combine all `etymology_text` values with `; ` separator
5. **IPA** → extract from all `sounds[].ipa`, deduplicate
6. **Audio** → extract `ogg_url` or `mp3_url` from all sounds, deduplicate
7. **Synonyms** → extract from senses, flatten to array of strings

---

## Caching Strategy

### In-Memory Cache (Default)

- **Storage**: Python `dict` with TTL tracking
- **Key**: `f"{lang}:{word}"` (e.g., `"de:Haus"`)
- **TTL**: 24 hours (configurable)
- **Eviction**: LRU when cache size exceeds limit (default: 10,000 entries)
- **Size estimate**: ~100KB per entry → ~1GB max memory

**Cache Entry Structure:**
```python
{
    "data": {...},  # Transformed response
    "cached_at": 1741600000000,
    "expires_at": 1741686400000
}
```

### Optional: Redis Cache (Production)

For multi-instance deployments:
- **Key**: `kaikki:{lang}:{word}`
- **TTL**: 24 hours
- **Serialization**: JSON
- **Fallback**: If Redis unavailable, use in-memory cache

---

## Error Handling

### kaikki.org Errors

| Scenario | HTTP Status | Response |
|----------|------------|----------|
| Word not found (404) | 404 | `{"error": "word_not_found", ...}` |
| Network timeout | 500 | `{"error": "timeout", ...}` |
| Invalid JSONL | 500 | `{"error": "parse_error", ...}` |
| Rate limited by kaikki.org | 503 | `{"error": "upstream_unavailable", ...}` |

### Client Errors

| Scenario | HTTP Status | Response |
|----------|------------|----------|
| Invalid word (empty, special chars) | 400 | `{"error": "invalid_word", ...}` |
| Rate limit exceeded | 429 | `{"error": "rate_limit_exceeded", ...}` |

### Rate Limiting

- **Per IP**: 100 requests/minute (configurable)
- **Per word**: No limit (cached after first request)
- **Implementation**: `slowapi` or custom middleware

---

## Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Cache hit latency | < 50ms | In-memory lookup |
| Cache miss latency | < 500ms | Fetch + parse + transform |
| P95 latency | < 800ms | 95th percentile |
| P99 latency | < 1500ms | 99th percentile |
| Error rate | < 1% | Excluding 404s |
| Concurrent requests | 100+ | Single instance |

---

## Deployment Architecture

### Development

```
docker-compose.yml:
  - nginx:8080 → serves PWA static files
  - fastapi:8000 → kaikki API server
  - nginx proxies /api/* → fastapi:8000
```

### Production

```
┌─────────────────────────────────────────────────────────────┐
│  Nginx (Port 80/443)                                        │
│  - Serves / → static PWA files                              │
│  - Proxies /api/* → FastAPI backend                         │
│  - SSL termination                                           │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ├─→ / → static files (src/)
                     │
                     └─→ /api/kaikki/* → FastAPI (port 8000)
```

**Nginx Configuration Addition:**
```nginx
location /api/ {
    proxy_pass http://fastapi:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    
    # CORS headers (if needed)
    add_header Access-Control-Allow-Origin "*";
    add_header Access-Control-Allow-Methods "GET, OPTIONS";
}
```

---

## File Structure

```
extras/urwort/
├── api/                          # New FastAPI backend
│   ├── __init__.py
│   ├── main.py                   # FastAPI app, routes
│   ├── kaikki.py                 # kaikki.org fetching & parsing
│   ├── cache.py                  # Caching logic
│   ├── models.py                 # Pydantic models
│   ├── config.py                 # Configuration
│   └── requirements.txt           # FastAPI, httpx, etc.
├── docker-compose.yml            # Updated: add fastapi service
├── Dockerfile.api                # FastAPI Docker image
└── nginx.conf                    # Updated: proxy /api/* to FastAPI
```

---

## Implementation Plan

### Phase 1: Core API (MVP)
1. ✅ Create FastAPI app with single endpoint `/api/kaikki/{word}`
2. ✅ Implement kaikki.org JSONL fetching
3. ✅ Implement JSONL parsing and transformation
4. ✅ Add in-memory caching (24h TTL)
5. ✅ Error handling (404, 500, timeouts)
6. ✅ Basic rate limiting (100 req/min per IP)

### Phase 2: Integration
7. ✅ Update PWA `kaikki.js` to call `/api/kaikki/{word}` instead of direct fetch
8. ✅ Update nginx config to proxy `/api/*` to FastAPI
9. ✅ Update docker-compose to include FastAPI service
10. ✅ Test end-to-end: PWA → API → kaikki.org → PWA

### Phase 3: Production Readiness
11. ✅ Add Redis caching (optional, for multi-instance)
12. ✅ Add health check endpoint `/api/health`
13. ✅ Add metrics endpoint `/api/metrics` (optional)
14. ✅ Add request logging
15. ✅ Add Docker health checks

### Phase 4: Optimization
16. ✅ Batch requests (if needed: `/api/kaikki/batch`)
17. ✅ Prefetch popular words (optional background job)
18. ✅ Compression (gzip responses)

---

## Configuration

### Environment Variables

```bash
# API Server
KAIKKI_API_HOST=0.0.0.0
KAIKKI_API_PORT=8000

# Caching
KAIKKI_CACHE_TTL=86400  # 24 hours in seconds
KAIKKI_CACHE_MAX_SIZE=10000  # Max entries in memory cache
KAIKKI_USE_REDIS=false  # Set to true to use Redis
REDIS_URL=redis://localhost:6379/0

# Rate Limiting
KAIKKI_RATE_LIMIT_PER_MINUTE=100

# kaikki.org
KAIKKI_BASE_URL=https://kaikki.org/dictionary
KAIKKI_TIMEOUT=5  # seconds
KAIKKI_MAX_RETRIES=2

# Logging
LOG_LEVEL=INFO
```

---

## Testing Strategy

### Unit Tests
- JSONL parsing logic
- Data transformation
- Cache hit/miss behavior
- Error handling

### Integration Tests
- End-to-end: fetch from kaikki.org → transform → return
- CORS headers (if needed)
- Rate limiting

### Manual Testing
1. Test with real words: "Haus", "Schule", "Mädchen"
2. Test with words not in kaikki.org (should return 404)
3. Test rate limiting (100 requests quickly)
4. Test cache behavior (second request should be faster)

---

## Security Considerations

1. **Input validation**: Sanitize word parameter (no path traversal)
2. **Rate limiting**: Prevent abuse
3. **CORS**: Configure appropriately (same-origin or controlled origins)
4. **Error messages**: Don't leak internal details
5. **DDoS protection**: Rate limiting + optional Cloudflare/WAF

---

## Monitoring & Observability

### Metrics to Track
- Request count (per word, per hour)
- Cache hit rate
- Response time (p50, p95, p99)
- Error rate (by type)
- kaikki.org fetch failures

### Logging
- Request: `word`, `ip`, `response_time`, `status_code`
- Errors: Full stack trace for 500s
- Cache: Hit/miss events

---

## Future Enhancements

1. **Batch endpoint**: `/api/kaikki/batch` for multiple words
2. **WebSocket**: Real-time updates for long-running fetches
3. **Background jobs**: Pre-fetch popular words
4. **Multi-language**: Support other languages beyond German
5. **GraphQL**: Alternative API interface
6. **CDN caching**: Cache responses at edge (Cloudflare, etc.)

---

## Migration Path

### Step 1: Deploy API alongside existing PWA
- FastAPI runs on port 8000
- Nginx proxies `/api/*` to FastAPI
- PWA still uses old direct fetch (fallback)

### Step 2: Update PWA to use API
- Modify `kaikki.js` to call `/api/kaikki/{word}`
- Keep old code as fallback (commented out)

### Step 3: Remove old code
- Remove direct kaikki.org fetch from PWA
- Remove HTML parsing code (no longer needed)

---

## Dependencies

### Python Packages
```
fastapi==0.104.1
uvicorn[standard]==0.24.0
httpx==0.25.0
pydantic==2.5.0
slowapi==0.1.9  # Rate limiting
redis==5.0.1  # Optional, for Redis cache
python-json-logger==2.0.7  # Structured logging
```

### Optional
```
prometheus-fastapi-instrumentator==6.1.0  # Metrics
```

---

## Example Request/Response

### Request
```bash
curl http://localhost:8000/api/kaikki/Haus
```

### Response
```json
{
  "word": "Haus",
  "fetchedAt": 1741600000000,
  "entries": [
    {
      "word": "Haus",
      "pos": "noun",
      "etymology_number": 1,
      "senses": [
        {
          "glosses": ["house", "home", "building"],
          "raw_glosses": ["house", "home", "building"],
          "tags": ["neuter", "strong"],
          "links": [],
          "synonyms": ["Gebäude"]
        }
      ],
      "forms": [
        {"form": "Hauses", "tags": ["genitive", "singular"]},
        {"form": "Häuser", "tags": ["nominative", "plural"]}
      ],
      "etymology_text": "From Middle High German hūs...",
      "sounds": [
        {
          "ipa": "/haʊs/",
          "ogg_url": "https://upload.wikimedia.org/.../De-Haus.ogg",
          "mp3_url": "https://upload.wikimedia.org/.../De-Haus.ogg.mp3"
        }
      ]
    }
  ],
  "allSenses": [
    {
      "glosses": ["house", "home", "building"],
      "raw_glosses": ["house", "home", "building"],
      "tags": ["neuter", "strong"],
      "links": [],
      "synonyms": ["Gebäude"]
    }
  ],
  "allForms": [
    {"form": "Hauses", "tags": ["genitive", "singular"]},
    {"form": "Häuser", "tags": ["nominative", "plural"]}
  ],
  "etymology": "From Middle High German hūs...",
  "ipa": ["/haʊs/"],
  "audio": [
    "https://upload.wikimedia.org/.../De-Haus.ogg",
    "https://upload.wikimedia.org/.../De-Haus.ogg.mp3"
  ]
}
```

---

## Summary

This FastAPI backend:
- ✅ Solves CORS issues by proxying kaikki.org requests
- ✅ Returns data in the exact format PWA expects
- ✅ Caches responses for performance
- ✅ Handles errors gracefully
- ✅ Integrates seamlessly with existing nginx/PWA setup
- ✅ Keeps FreeDict core structure unchanged
- ✅ Minimal dependencies, fast, lightweight

The PWA only needs to change one function: `Kaikki.fetchWord()` to call `/api/kaikki/{word}` instead of fetching directly from kaikki.org.
