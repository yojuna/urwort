#!/bin/bash
# Test script for DWDS API endpoint

echo "=========================================="
echo "Testing DWDS API Endpoint"
echo "=========================================="
echo ""

BASE_URL="http://localhost:8000"

echo "1. Testing DWDS endpoint: Haus..."
curl -s "$BASE_URL/api/dwds/Haus" | python3 -m json.tool
echo ""

echo "2. Testing DWDS endpoint: Schule..."
curl -s "$BASE_URL/api/dwds/Schule" | python3 -m json.tool
echo ""

echo "3. Testing nonexistent word (should return 404)..."
curl -s -w "\nHTTP Status: %{http_code}\n" "$BASE_URL/api/dwds/nonexistentword12345" | python3 -m json.tool 2>/dev/null || echo "404 Not Found"
echo ""

echo "=========================================="
echo "Testing complete!"
echo "=========================================="
