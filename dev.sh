#!/usr/bin/env bash
# ============================================================
# Urwort — Start dev container and open an interactive shell
# ============================================================
#
# Usage:
#   ./dev.sh          # start container + open bash inside it
#   ./dev.sh shell    # same as above (default)
#   ./dev.sh up       # start container in background (no shell)
#   ./dev.sh down     # stop container
#   ./dev.sh logs     # tail container logs
#   ./dev.sh status   # show container status
#   ./dev.sh rebuild  # force rebuild container image
#
# The container runs Vite (port 5173) and FastAPI (port 8000)
# automatically. This script just opens a shell for you.
# ============================================================

set -euo pipefail
cd "$(dirname "$0")"

# ── Colors ───────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

CONTAINER="urwort-dev"

info()  { echo -e "${BLUE}▸${RESET} $*"; }
ok()    { echo -e "${GREEN}✔${RESET} $*"; }
warn()  { echo -e "${YELLOW}⚠${RESET} $*"; }
err()   { echo -e "${RED}✘${RESET} $*" >&2; }
header(){ echo -e "\n${BOLD}${CYAN}═══ $* ═══${RESET}\n"; }

is_running() {
  docker ps --filter "name=${CONTAINER}" --format '{{.Names}}' 2>/dev/null | grep -q "^${CONTAINER}$"
}

ensure_running() {
  local build_flag="${1:---build}"
  if is_running; then
    ok "Container ${BOLD}${CONTAINER}${RESET} is already running"
  else
    info "Starting container..."
    docker compose up -d $build_flag 2>&1 | sed "s/^/  ${DIM}/"
    echo -ne "${RESET}"
    # Wait for container to be ready
    local retries=0
    while ! is_running && [ $retries -lt 15 ]; do
      sleep 1
      retries=$((retries + 1))
    done
    if is_running; then
      ok "Container started"
    else
      err "Container failed to start"
      docker compose logs --tail=20
      exit 1
    fi
  fi
}

cmd="${1:-shell}"

case "$cmd" in
  shell|sh)
    header "Urwort Dev Shell"
    ensure_running
    echo ""
    info "Vite dev server → ${BOLD}http://localhost:5173${RESET}"
    info "FastAPI          → ${BOLD}http://localhost:8000${RESET}"
    info "Type ${BOLD}exit${RESET} to leave the shell (container keeps running)"
    echo ""
    docker exec -it "$CONTAINER" bash
    ;;
  up)
    header "Urwort Dev — Start"
    ensure_running
    info "Vite dev server → ${BOLD}http://localhost:5173${RESET}"
    info "FastAPI          → ${BOLD}http://localhost:8000${RESET}"
    ;;
  down|stop)
    header "Urwort Dev — Stop"
    docker compose down
    ok "Container stopped"
    ;;
  logs)
    docker compose logs -f --tail=80
    ;;
  status)
    header "Urwort Dev — Status"
    if is_running; then
      ok "Container is ${GREEN}running${RESET}"
      docker ps --filter "name=${CONTAINER}" --format "table {{.Status}}\t{{.Ports}}"
    else
      warn "Container is ${YELLOW}not running${RESET}"
    fi
    ;;
  rebuild)
    header "Urwort Dev — Rebuild"
    info "Stopping old container..."
    docker compose down 2>/dev/null || true
    info "Rebuilding image..."
    ensure_running "--build"
    ok "Rebuilt and started"
    ;;
  *)
    err "Unknown command: $cmd"
    echo "Usage: ./dev.sh [shell|up|down|logs|status|rebuild]"
    exit 1
    ;;
esac
