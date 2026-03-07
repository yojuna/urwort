#!/bin/bash
# Test script for Docker setup

echo "=========================================="
echo "Testing Docker Setup"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Check if containers are running
echo "1. Checking if containers are running..."
if docker compose ps | grep -q "urwort-api.*Up"; then
    echo -e "${GREEN}✓ API container is running${NC}"
else
    echo -e "${RED}✗ API container is not running${NC}"
    echo "   Run: docker compose up"
    exit 1
fi

if docker compose ps | grep -q "urwort-dev.*Up"; then
    echo -e "${GREEN}✓ Nginx container is running${NC}"
else
    echo -e "${RED}✗ Nginx container is not running${NC}"
    echo "   Run: docker compose up"
    exit 1
fi
echo ""

# Test 2: Test API health endpoint (direct)
echo "2. Testing API health endpoint (direct:8000)..."
if curl -s http://localhost:8000/api/health | grep -q "healthy"; then
    echo -e "${GREEN}✓ API health check passed${NC}"
    curl -s http://localhost:8000/api/health | python3 -m json.tool 2>/dev/null || echo "   (JSON parsing failed, but endpoint responded)"
else
    echo -e "${RED}✗ API health check failed${NC}"
    echo "   Check: docker compose logs urwort-api"
fi
echo ""

# Test 3: Test API via nginx proxy
echo "3. Testing API via nginx proxy (8080)..."
if curl -s http://localhost:8080/api/health | grep -q "healthy"; then
    echo -e "${GREEN}✓ API proxy working${NC}"
    curl -s http://localhost:8080/api/health | python3 -m json.tool 2>/dev/null || echo "   (JSON parsing failed, but endpoint responded)"
else
    echo -e "${RED}✗ API proxy failed${NC}"
    echo "   Check: docker compose logs urwort-dev"
fi
echo ""

# Test 4: Test word fetching (direct)
echo "4. Testing word fetch: Haus (direct:8000)..."
if curl -s http://localhost:8000/api/kaikki/Haus | grep -q "word"; then
    echo -e "${GREEN}✓ Word fetch working (direct)${NC}"
    echo "   Response preview:"
    curl -s http://localhost:8000/api/kaikki/Haus | python3 -m json.tool 2>/dev/null | head -10 || echo "   (Could not parse JSON)"
else
    echo -e "${YELLOW}⚠ Word fetch may have failed (check response)${NC}"
    curl -s -w "\nHTTP Status: %{http_code}\n" http://localhost:8000/api/kaikki/Haus | tail -5
fi
echo ""

# Test 5: Test word fetching via proxy
echo "5. Testing word fetch: Haus (via proxy:8080)..."
if curl -s http://localhost:8080/api/kaikki/Haus | grep -q "word"; then
    echo -e "${GREEN}✓ Word fetch working (via proxy)${NC}"
    echo "   Response preview:"
    curl -s http://localhost:8080/api/kaikki/Haus | python3 -m json.tool 2>/dev/null | head -10 || echo "   (Could not parse JSON)"
else
    echo -e "${YELLOW}⚠ Word fetch may have failed (check response)${NC}"
    curl -s -w "\nHTTP Status: %{http_code}\n" http://localhost:8080/api/kaikki/Haus | tail -5
fi
echo ""

# Test 6: Test frontend
echo "6. Testing frontend (8080)..."
if curl -s http://localhost:8080/ | grep -q "html"; then
    echo -e "${GREEN}✓ Frontend is accessible${NC}"
else
    echo -e "${YELLOW}⚠ Frontend may not be loading correctly${NC}"
fi
echo ""

echo "=========================================="
echo "Testing complete!"
echo "=========================================="
echo ""
echo "If all tests passed, you can:"
echo "  1. Open http://localhost:8080 in your browser"
echo "  2. Test API: curl http://localhost:8080/api/kaikki/Haus"
echo ""
