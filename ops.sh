#!/bin/bash
# ============================================================
# ops.sh — Launch the urwort ops toolbox container
#
# Usage (from project root):
#   ./ops.sh            # interactive shell
#   ./ops.sh plan       # run deploy.sh plan directly
#   ./ops.sh sync       # run deploy.sh sync directly
# ============================================================
set -e

COMPOSE_FILE="infra/docker-compose.ops.yml"

if [ $# -eq 0 ]; then
    # No args — drop into interactive shell
    docker compose -f "$COMPOSE_FILE" run --rm ops
else
    # Args passed — run deploy.sh with them
    docker compose -f "$COMPOSE_FILE" run --rm ops ./scripts/deploy.sh "$@"
fi
