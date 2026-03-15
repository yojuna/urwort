#!/bin/bash
# ============================================================
# Quick-deploy frontend changes to the urwort server
#
# This script is a lightweight alternative to a full Ansible run.
# It syncs only the frontend source (src/), rebuilds the 'web' container,
# and restarts it — typically takes ~30-60 seconds.
#
# Usage (inside ops container):
#   cd /ops && ./scripts/deploy-frontend.sh
#
# Or with an explicit IP:
#   SERVER_IP=1.2.3.4 ./scripts/deploy-frontend.sh
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(dirname "$SCRIPT_DIR")"
TF_DIR="$INFRA_DIR/terraform"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

SSH_KEY="$HOME/.ssh/urwort_ed25519"
SSH_OPTS="-F /dev/null -o StrictHostKeyChecking=no -i $SSH_KEY"
APP_DIR="/opt/urwort"

# ── Resolve server IP ─────────────────────────────────────────────────────────
if [ -n "${SERVER_IP:-}" ]; then
    IP="$SERVER_IP"
else
    echo -e "${YELLOW}Reading server IP from Terraform state...${NC}"
    cd "$TF_DIR"
    IP=$(terraform output -raw server_ip 2>/dev/null || echo "")
fi

if [ -z "$IP" ]; then
    echo -e "${RED}Cannot find server IP.${NC}"
    echo "Set SERVER_IP env var or run 'deploy.sh apply' first."
    exit 1
fi

echo -e "${GREEN}━━━ Frontend Deploy → ${IP} ━━━${NC}"
echo ""

# ── Step 1: Rsync frontend source ─────────────────────────────────────────────
echo -e "${YELLOW}[1/3] Syncing src/...${NC}"
rsync -avz --delete \
    --exclude='.DS_Store' \
    -e "ssh $SSH_OPTS" \
    /ops/app/src/ \
    "root@${IP}:${APP_DIR}/src/"

echo -e "  ${GREEN}✓ src/ synced${NC}"
echo ""

# ── Step 2: Rebuild web container on server ────────────────────────────────────
echo -e "${YELLOW}[2/3] Rebuilding web container on server...${NC}"
ssh $SSH_OPTS "root@${IP}" bash -s <<'REMOTE'
set -euo pipefail
cd /opt/urwort
echo "  Building web image..."
docker compose -f infra/docker/docker-compose.prod.yml build --no-cache web
echo "  ✓ Web image rebuilt"
REMOTE

echo ""

# ── Step 3: Restart web service ───────────────────────────────────────────────
echo -e "${YELLOW}[3/3] Restarting web service...${NC}"
ssh $SSH_OPTS "root@${IP}" bash -s <<'REMOTE'
set -euo pipefail
cd /opt/urwort
docker compose -f infra/docker/docker-compose.prod.yml up -d urwort-web
echo "  ✓ Web service restarted"
REMOTE

echo ""
echo -e "${GREEN}━━━ Frontend deployed! ━━━${NC}"
echo -e "  URL: ${CYAN}http://$(echo "$IP" | tr '.' '-').sslip.io${NC}"
echo ""
