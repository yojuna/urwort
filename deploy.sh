#!/usr/bin/env bash
# ============================================================
# Urwort — Build & Deploy to GitHub Pages
# ============================================================
#
# Runs the full pipeline inside the dev container:
#   1. Export ontology (Python) → game/public/ontology.json
#   2. TypeScript check + Vite build → game/dist/
#   3. Commit and push to main + pages-deploy branch
#
# Usage:
#   ./deploy.sh                  # full pipeline
#   ./deploy.sh --skip-export    # skip ontology export (use existing JSON)
#   ./deploy.sh --dry-run        # build but don't push
#
# Requires: the dev container to be running (./dev.sh up)
# ============================================================

set -euo pipefail
cd "$(dirname "$0")"

# ── Colors ───────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

CONTAINER="urwort-dev"
DEPLOY_BRANCH="pages-deploy"

info()  { echo -e "  ${BLUE}▸${RESET} $*"; }
ok()    { echo -e "  ${GREEN}✔${RESET} $*"; }
warn()  { echo -e "  ${YELLOW}⚠${RESET} $*"; }
err()   { echo -e "  ${RED}✘${RESET} $*" >&2; }
step()  { echo -e "\n${BOLD}${CYAN}[$1/${TOTAL_STEPS}]${RESET} ${BOLD}$2${RESET}"; }
header(){ echo -e "\n${BOLD}${MAGENTA}╔══════════════════════════════════════════╗${RESET}"; \
          echo -e "${BOLD}${MAGENTA}║${RESET}  ${BOLD}$*${RESET}"; \
          echo -e "${BOLD}${MAGENTA}╚══════════════════════════════════════════╝${RESET}"; }

timer_start() { TIMER_START=$(date +%s); }
timer_end()   { local elapsed=$(( $(date +%s) - TIMER_START )); echo -e "  ${DIM}(${elapsed}s)${RESET}"; }

# ── Parse flags ──────────────────────────────────────────────
SKIP_EXPORT=false
DRY_RUN=false
TOTAL_STEPS=4

for arg in "$@"; do
  case "$arg" in
    --skip-export) SKIP_EXPORT=true; TOTAL_STEPS=3 ;;
    --dry-run)     DRY_RUN=true ;;
    -h|--help)
      echo "Usage: ./deploy.sh [--skip-export] [--dry-run]"
      exit 0 ;;
    *)
      err "Unknown flag: $arg"
      exit 1 ;;
  esac
done

header "Urwort — Build & Deploy"

# ── Pre-flight checks ───────────────────────────────────────
if ! docker ps --filter "name=${CONTAINER}" --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  err "Container ${BOLD}${CONTAINER}${RESET} is not running."
  info "Start it first: ${BOLD}./dev.sh up${RESET}"
  exit 1
fi
ok "Container ${BOLD}${CONTAINER}${RESET} is running"

STEP=0

# ── Step 1: Export ontology ──────────────────────────────────
if [ "$SKIP_EXPORT" = false ]; then
  STEP=$((STEP + 1))
  step $STEP "Exporting ontology (Python → ontology.json)"
  timer_start

  docker exec "$CONTAINER" sh -c "cd /workspace && python3 tools/export-ontology.py 2>&1" \
    | while IFS= read -r line; do
        # Colorise key lines
        if echo "$line" | grep -q '^\[ontology\]'; then
          echo -e "  ${DIM}${line}${RESET}"
        elif echo "$line" | grep -q '^─'; then
          echo -e "  ${CYAN}${line}${RESET}"
        elif echo "$line" | grep -qE '^\s+(Clusters|Multi|Single|Total|Words)'; then
          echo -e "  ${GREEN}${line}${RESET}"
        elif echo "$line" | grep -qE '^\s+Sample'; then
          echo -e "  ${YELLOW}${line}${RESET}"
        elif echo "$line" | grep -qE '^\s+\['; then
          echo -e "  ${DIM}${line}${RESET}"
        else
          echo -e "  ${line}"
        fi
      done

  timer_end
  ok "Ontology exported"
fi

# ── Step 2: TypeScript check + Vite build ────────────────────
STEP=$((STEP + 1))
step $STEP "Building game (tsc + vite build)"
timer_start

docker exec "$CONTAINER" sh -c "cd /workspace/game && npm run build 2>&1" \
  | while IFS= read -r line; do
      if echo "$line" | grep -q 'error TS'; then
        echo -e "  ${RED}${line}${RESET}"
      elif echo "$line" | grep -q '✓'; then
        echo -e "  ${GREEN}${line}${RESET}"
      elif echo "$line" | grep -q 'dist/'; then
        echo -e "  ${CYAN}${line}${RESET}"
      else
        echo -e "  ${DIM}${line}${RESET}"
      fi
    done

timer_end

# Verify build output exists
if docker exec "$CONTAINER" test -f /workspace/game/dist/index.html; then
  BUILD_SIZE=$(docker exec "$CONTAINER" sh -c "du -sh /workspace/game/dist/ | cut -f1")
  ok "Build successful — ${BOLD}dist/${RESET} is ${BOLD}${BUILD_SIZE}${RESET}"
else
  err "Build failed — dist/index.html not found"
  exit 1
fi

# ── Step 3: Git commit ───────────────────────────────────────
STEP=$((STEP + 1))
step $STEP "Committing changes"

if git diff --quiet && git diff --cached --quiet; then
  warn "No changes to commit — working tree is clean"
else
  # Show what changed
  info "Changed files:"
  git diff --stat | while IFS= read -r line; do
    echo -e "    ${DIM}${line}${RESET}"
  done

  git add -A

  # Auto-generate commit message with stats
  WORD_COUNT=$(docker exec "$CONTAINER" sh -c \
    "python3 -c \"import json; d=json.load(open('/workspace/game/public/ontology.json')); print(d['stats']['total_words'])\"" 2>/dev/null || echo "?")
  CLUSTER_COUNT=$(docker exec "$CONTAINER" sh -c \
    "python3 -c \"import json; d=json.load(open('/workspace/game/public/ontology.json')); print(d['stats']['total_clusters'])\"" 2>/dev/null || echo "?")

  TIMESTAMP=$(date '+%Y-%m-%d %H:%M')
  COMMIT_MSG="deploy: build ${TIMESTAMP} (${WORD_COUNT} words, ${CLUSTER_COUNT} clusters)"

  git commit -m "$COMMIT_MSG" --quiet
  ok "Committed: ${DIM}${COMMIT_MSG}${RESET}"
fi

# ── Step 4: Push & deploy ────────────────────────────────────
STEP=$((STEP + 1))
step $STEP "Pushing to GitHub (main + ${DEPLOY_BRANCH})"

if [ "$DRY_RUN" = true ]; then
  warn "Dry run — skipping push"
  info "Would push to: ${BOLD}origin main${RESET} and ${BOLD}origin main:${DEPLOY_BRANCH}${RESET}"
else
  timer_start

  git push origin main 2>&1 | while IFS= read -r line; do
    echo -e "  ${DIM}${line}${RESET}"
  done

  git push origin "main:${DEPLOY_BRANCH}" 2>&1 | while IFS= read -r line; do
    echo -e "  ${DIM}${line}${RESET}"
  done

  timer_end
  ok "Pushed to ${BOLD}main${RESET} and ${BOLD}${DEPLOY_BRANCH}${RESET}"
fi

# ── Summary ──────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${GREEN}║${RESET}  ${BOLD}Deploy complete!${RESET}"
echo -e "${BOLD}${GREEN}║${RESET}"
echo -e "${BOLD}${GREEN}║${RESET}  ${DIM}GitHub Actions will build & publish to:${RESET}"
echo -e "${BOLD}${GREEN}║${RESET}  ${BOLD}https://yojuna.github.io/urwort/${RESET}"
echo -e "${BOLD}${GREEN}║${RESET}"
echo -e "${BOLD}${GREEN}║${RESET}  ${DIM}Watch progress:${RESET}"
echo -e "${BOLD}${GREEN}║${RESET}  ${BOLD}https://github.com/yojuna/urwort/actions${RESET}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════╝${RESET}"
echo ""
