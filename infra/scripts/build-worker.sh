#!/usr/bin/env bash
# ============================================================
# build-worker.sh — NOT APPLICABLE for urwort
#
# This script was inherited from the kural project, which used a
# GPU worker container for ML inference (RunPod / GHCR).
#
# urwort has no GPU worker and does not use RunPod or GHCR image
# publishing.  This file is kept as a reference only.
#
# If you later add a worker image to urwort, adapt this script
# and remove this notice.
# ============================================================

echo "build-worker.sh: not applicable for urwort — see header comment."
exit 0
