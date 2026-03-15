#!/bin/bash
# Test script for DWDS Corpus API endpoint

API_URL="http://localhost:8000/api/dwds"
TEST_WORDS=("Zeit" "Haus" "Schule" "Buch")

echo "=== Testing DWDS Corpus API ==="
echo ""

for word in "${TEST_WORDS[@]}"; do
    echo "--- Testing word: $word ---"
    response=$(curl -s "${API_URL}/${word}")
    
    # Check if we got a valid response
    if echo "$response" | python3 -c "import sys, json; data = json.load(sys.stdin); print(f'Word: {data.get(\"word\", \"N/A\")}'); print(f'Part of speech: {data.get(\"wortart\", \"N/A\")}'); print(f'Examples: {len(data.get(\"examples\", []))}'); print(f'URL: {data.get(\"url\", \"N/A\")}')" 2>/dev/null; then
        echo "✓ Success"
    else
        echo "✗ Failed or invalid response"
        echo "$response" | head -5
    fi
    echo ""
done

echo "=== Testing via Nginx proxy ==="
echo ""
word="Zeit"
echo "--- Testing word: $word via proxy ---"
curl -s "http://localhost:8080/api/dwds/${word}" | python3 -c "import sys, json; data = json.load(sys.stdin); print(f'Word: {data.get(\"word\", \"N/A\")}'); print(f'Examples: {len(data.get(\"examples\", []))}')" 2>/dev/null || echo "✗ Failed"
echo ""
