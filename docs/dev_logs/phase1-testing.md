# Phase 1 Testing Guide

## Overview

Phase 1 implements the core FastAPI backend with:
- ✅ kaikki.org JSONL fetching
- ✅ JSONL parsing and transformation
- ✅ In-memory caching (24h TTL)
- ✅ Error handling (404, 500, timeouts)
- ✅ Rate limiting (100 req/min)

## Prerequisites

1. Python 3.8+ installed
2. Virtual environment (recommended)

## Setup

```bash
cd /home/aj/code/extras/urwort/api

# Create virtual environment (optional but recommended)
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

## Running the Server

```bash
# From the api/ directory
python -m api.main

# Or using uvicorn directly
uvicorn api.main:app --reload --host 0.0.0.0 --port 8000
```

The server will start on `http://localhost:8000`

## Testing Steps

### 1. Test Root Endpoint

```bash
curl http://localhost:8000/
```

**Expected:** JSON response with service info

### 2. Test Health Endpoint

```bash
curl http://localhost:8000/api/health
```

**Expected:** JSON with `status: "healthy"` and cache stats

### 3. Test Word Fetching (Success Case)

```bash
curl http://localhost:8000/api/kaikki/Haus | python -m json.tool
```

**Expected:**
- Status: 200 OK
- JSON response with:
  - `word: "Haus"`
  - `fetchedAt: <timestamp>`
  - `entries: [...]`
  - `allSenses: [...]`
  - `allForms: [...]`
  - `etymology: "..."` (if available)
  - `ipa: [...]`
  - `audio: [...]`

### 4. Test Cache (Second Request)

```bash
# First request (cache miss)
time curl -s http://localhost:8000/api/kaikki/Haus > /dev/null

# Second request (cache hit - should be faster)
time curl -s http://localhost:8000/api/kaikki/Haus > /dev/null
```

**Expected:**
- First request: ~200-500ms (fetching from kaikki.org)
- Second request: < 50ms (from cache)

### 5. Test Nonexistent Word (404)

```bash
curl -v http://localhost:8000/api/kaikki/nonexistentword12345
```

**Expected:**
- Status: 404 Not Found
- JSON error response:
  ```json
  {
    "error": "word_not_found",
    "message": "Word 'nonexistentword12345' not found in kaikki.org",
    "word": "nonexistentword12345"
  }
  ```

### 6. Test Multiple Words

```bash
# Test a few common German words
curl http://localhost:8000/api/kaikki/Schule | python -m json.tool | head -20
curl http://localhost:8000/api/kaikki/Mädchen | python -m json.tool | head -20
curl http://localhost:8000/api/kaikki/Auto | python -m json.tool | head -20
```

**Expected:** All should return 200 OK with data

### 7. Test Rate Limiting

```bash
# Make 101 requests quickly (limit is 100/min)
for i in {1..101}; do
  curl -s -w "\nRequest $i: HTTP %{http_code}\n" http://localhost:8000/api/kaikki/Haus > /dev/null
done
```

**Expected:**
- First 100 requests: 200 OK
- 101st request: 429 Too Many Requests

### 8. Automated Test Script

```bash
cd /home/aj/code/extras/urwort/api
./test_manual.sh
```

This runs all the above tests automatically.

## Verification Checklist

- [ ] Server starts without errors
- [ ] Root endpoint returns service info
- [ ] Health endpoint shows cache stats
- [ ] Word "Haus" returns valid data
- [ ] Cache works (second request is faster)
- [ ] Nonexistent word returns 404
- [ ] Multiple words work correctly
- [ ] Rate limiting works (429 after 100 requests)
- [ ] Response format matches PWA expectations

## Common Issues

### Issue: `ModuleNotFoundError: No module named 'api'`

**Solution:** Run from the project root directory:
```bash
cd /home/aj/code/extras/urwort
python -m api.main
```

### Issue: `Connection refused` when testing

**Solution:** Make sure the server is running on port 8000:
```bash
# Check if port is in use
lsof -i :8000

# Or use a different port
uvicorn api.main:app --port 8001
```

### Issue: `httpx.TimeoutException`

**Solution:** kaikki.org might be slow. Increase timeout in `api/config.py`:
```python
KAIKKI_TIMEOUT = 10  # seconds
```

### Issue: Rate limiting not working

**Solution:** Make sure slowapi is installed:
```bash
pip install slowapi==0.1.9
```

## Next Steps

Once Phase 1 testing passes:
1. ✅ Verify all tests pass
2. ✅ Check response format matches PWA expectations
3. ✅ Proceed to Phase 2: Integration

## Response Format Verification

The response should match this structure (from `api/models.py`):

```python
{
  "word": str,
  "fetchedAt": int,  # Unix timestamp in milliseconds
  "entries": [Entry],  # Array of entries
  "allSenses": [Sense],  # Flattened senses
  "allForms": [Form],  # Deduplicated forms
  "etymology": str | None,
  "ipa": [str],  # Array of IPA strings
  "audio": [str],  # Array of audio URLs
}
```

This matches what the PWA expects in `entry.sources.kaikki`.
