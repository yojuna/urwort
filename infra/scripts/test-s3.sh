#!/bin/bash
# ============================================================
# test-s3.sh — DISABLED for urwort
#
# urwort does not use object storage (S3 / Hetzner Object Storage).
# The SQLite database lives on a Hetzner persistent volume instead.
#
# This file is kept as a reference.  If you add S3 later:
#   1. Uncomment the body below
#   2. Add boto3/s3cmd/aws-cli back to infra/Dockerfile.ops
#   3. Add S3 vars to infra/.env.ops
# ============================================================

echo "test-s3.sh: S3 is not configured for urwort — see header comment."
exit 0

# ── Disabled body (original kural S3 test) ────────────────────────────────────
# set -euo pipefail
#
# RED='\033[0;31m'
# GREEN='\033[0;32m'
# YELLOW='\033[1;33m'
# NC='\033[0m'
#
# echo -e "${YELLOW}━━━ Hetzner Object Storage Connectivity Test ━━━${NC}"
# echo ""
#
# for VAR in AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_ENDPOINT_URL; do
#     if [ -z "${!VAR:-}" ]; then
#         echo -e "${RED}✗ $VAR is not set. Check .env.ops${NC}"
#         exit 1
#     fi
#     echo -e "${GREEN}✓${NC} $VAR = ${!VAR}"
# done
# echo ""
#
# echo -e "${YELLOW}[1/4] Listing buckets...${NC}"
# aws s3 ls --endpoint-url "$AWS_ENDPOINT_URL"
# echo -e "${GREEN}  ✓ Bucket listing OK${NC}"
# echo ""
#
# BUCKET="urwort-backups"
# echo -e "${YELLOW}[checking] s3://${BUCKET}${NC}"
# aws s3 ls "s3://${BUCKET}/" --endpoint-url "$AWS_ENDPOINT_URL" 2>&1 && \
#     echo -e "${GREEN}  ✓ ${BUCKET} accessible${NC}" || \
#     echo -e "${RED}  ✗ ${BUCKET} not accessible${NC}"
#
# echo -e "${YELLOW}[2/4] Upload test → ${BUCKET}...${NC}"
# echo "connectivity-check $(date -Iseconds)" > /tmp/urwort-test.txt
# aws s3 cp /tmp/urwort-test.txt "s3://${BUCKET}/_test/connectivity-check.txt" \
#     --endpoint-url "$AWS_ENDPOINT_URL"
# echo -e "${GREEN}  ✓ Upload OK${NC}"
#
# echo -e "${YELLOW}[3/4] Download test...${NC}"
# aws s3 cp "s3://${BUCKET}/_test/connectivity-check.txt" /tmp/urwort-test-dl.txt \
#     --endpoint-url "$AWS_ENDPOINT_URL"
# echo -e "${GREEN}  ✓ Download OK — $(cat /tmp/urwort-test-dl.txt)${NC}"
#
# echo -e "${YELLOW}[4/4] Cleanup test file...${NC}"
# aws s3 rm "s3://${BUCKET}/_test/connectivity-check.txt" \
#     --endpoint-url "$AWS_ENDPOINT_URL"
# rm -f /tmp/urwort-test.txt /tmp/urwort-test-dl.txt
# echo -e "${GREEN}  ✓ Cleanup OK${NC}"
#
# echo ""
# echo -e "${GREEN}━━━ All tests passed ✅ ━━━${NC}"
