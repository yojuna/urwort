#!/bin/bash
# ============================================================
# urwort Ops Container — Entrypoint
#
# Runs on every container start:
#   1. Sets up SSH deploy key with correct root permissions
#   2. Derives TF_VAR_* from primary env vars (single source of truth)
# ============================================================
set -e

# ── SSH key setup ─────────────────────────────────────────────────────────────
SSH_DIR="/root/.ssh"
KEY_SOURCE="/ssh-keys/urwort_ed25519"

mkdir -p "$SSH_DIR"
chmod 700 "$SSH_DIR"

if [ -f "$KEY_SOURCE" ]; then
    install -m 600 "$KEY_SOURCE"     "$SSH_DIR/urwort_ed25519"
    install -m 644 "${KEY_SOURCE}.pub" "$SSH_DIR/urwort_ed25519.pub" 2>/dev/null || true
    echo "[ops] SSH deploy key loaded: $SSH_DIR/urwort_ed25519"
else
    echo "[ops] WARNING: deploy key not found at $KEY_SOURCE"
    echo "      Mount it via docker-compose.ops.yml volumes section."
fi

cat > "$SSH_DIR/config" << 'SSHCONFIG'
Host *
    IdentityFile ~/.ssh/urwort_ed25519
    StrictHostKeyChecking accept-new
    ServerAliveInterval 60
    ServerAliveCountMax 3
    ConnectTimeout 10
SSHCONFIG
chmod 600 "$SSH_DIR/config"

# ── Derive Terraform variables from primary env vars ──────────────────────────
# .env.ops defines each credential ONCE (HCLOUD_TOKEN).
# Terraform expects TF_VAR_<name> — we derive them here so nothing is duplicated.
export TF_VAR_hcloud_token="${HCLOUD_TOKEN:-}"

echo "[ops] TF_VAR_* derived from environment"

# S3 / Object Storage — disabled for urwort (no bucket resources in Terraform).
# Uncomment if you add S3 later.
# export TF_VAR_s3_access_key="${AWS_ACCESS_KEY_ID:-}"
# export TF_VAR_s3_secret_key="${AWS_SECRET_ACCESS_KEY:-}"
# export TF_VAR_s3_endpoint="${AWS_ENDPOINT_URL#https://}"
# export TF_VAR_s3_region="${AWS_DEFAULT_REGION:-nbg1}"

exec "$@"
