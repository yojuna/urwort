# ============================================================
# urwort Infrastructure — Hetzner Cloud
#
# Provisions:
#   - SSH key
#   - Firewall (SSH + HTTP + HTTPS)
#   - CX22 server (2 vCPU, 4 GB RAM, Ubuntu 24.04)
#   - 20 GB persistent volume  → /mnt/urwort-data  (SQLite DB)
#
# S3 / RunPod are NOT used by urwort — those blocks are omitted.
# Uncomment the minio provider + bucket resources in variables.tf
# if you add object storage later.
# ============================================================

terraform {
  required_version = ">= 1.5"

  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.45"
    }
  }
}

# ── Hetzner Cloud Provider ────────────────────────────────────
provider "hcloud" {
  token = var.hcloud_token
}

# ============================================================
# SSH Key
# ============================================================
resource "hcloud_ssh_key" "urwort" {
  name       = "urwort-deploy"
  public_key = file(pathexpand(var.ssh_public_key_path))
}

# ============================================================
# Firewall
# ============================================================
resource "hcloud_firewall" "urwort" {
  name = "urwort-fw"

  # SSH
  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "22"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  # HTTP
  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "80"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  # HTTPS
  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "443"
    source_ips = ["0.0.0.0/0", "::/0"]
  }
}

# ============================================================
# Server
# ============================================================
resource "hcloud_server" "urwort" {
  name        = "urwort-server"
  server_type = var.server_type
  image       = var.server_image
  location    = var.hetzner_location
  ssh_keys    = [hcloud_ssh_key.urwort.id]

  firewall_ids = [hcloud_firewall.urwort.id]

  labels = {
    project = "urwort"
    env     = "production"
  }
}

# ============================================================
# Persistent Volume  (SQLite DB + raw-data if needed)
# ============================================================
resource "hcloud_volume" "urwort_data" {
  name     = "urwort-data"
  size     = var.volume_size_gb
  location = var.hetzner_location
  format   = "ext4"
}

resource "hcloud_volume_attachment" "urwort_data" {
  volume_id = hcloud_volume.urwort_data.id
  server_id = hcloud_server.urwort.id
  automount = true
}

# ============================================================
# Object Storage — disabled for urwort
# ============================================================
# Uncomment + add minio provider to required_providers if needed.
#
# provider "minio" {
#   minio_server   = var.s3_endpoint
#   minio_user     = var.s3_access_key
#   minio_password = var.s3_secret_key
#   minio_ssl      = true
# }
#
# resource "minio_s3_bucket" "backups" {
#   bucket = "urwort-backups"
#   acl    = "private"
#   lifecycle { prevent_destroy = true }
# }
