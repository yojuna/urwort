#!/bin/bash
# Manual test script for Phase 1 testing

echo "=========================================="
echo "Testing Kaikki API - Phase 1"
echo "=========================================="
echo ""

BASE_URL="http://localhost:8000"

echo "1. Testing root endpoint..."
curl -s "$BASE_URL/" | python -m json.tool
echo ""

echo "2. Testing health endpoint..."
curl -s "$BASE_URL/api/health" | python -m json.tool
echo ""

echo "3. Testing word: Haus (should succeed)..."
curl -s "$BASE_URL/api/kaikki/Haus" | python -m json.tool | head -30
echo ""

echo "4. Testing word: Schule (should succeed)..."
curl -s "$BASE_URL/api/kaikki/Schule" | python -m json.tool | head -30
echo ""

echo "5. Testing cache (second request to Haus should be faster)..."
time curl -s "$BASE_URL/api/kaikki/Haus" > /dev/null
echo ""

echo "6. Testing nonexistent word (should return 404)..."
curl -s -w "\nHTTP Status: %{http_code}\n" "$BASE_URL/api/kaikki/nonexistentword12345" | python -m json.tool
echo ""

echo "7. Testing health endpoint again (check cache stats)..."
curl -s "$BASE_URL/api/health" | python -m json.tool
echo ""

echo "=========================================="
echo "Testing complete!"
echo "=========================================="
