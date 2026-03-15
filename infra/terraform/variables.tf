# ============================================================
# urwort Infrastructure — Variables
# ============================================================

# ── Hetzner Cloud ────────────────────────────────────────────
variable "hcloud_token" {
  description = "Hetzner Cloud API token"
  type        = string
  sensitive   = true
}

variable "hetzner_location" {
  description = "Hetzner datacenter location"
  type        = string
  default     = "nbg1"
}

variable "server_type" {
  description = "Hetzner server type (cx22=2vCPU/4GB, cx32=4vCPU/8GB)"
  type        = string
  default     = "cx22"
}

variable "server_image" {
  description = "OS image for the server"
  type        = string
  default     = "ubuntu-24.04"
}

# ── SSH ──────────────────────────────────────────────────────
variable "ssh_public_key_path" {
  description = "Path to the urwort deploy SSH public key"
  type        = string
  default     = "~/.ssh/urwort_ed25519.pub"
}

# ── Storage Volume ────────────────────────────────────────────
variable "volume_size_gb" {
  description = "Persistent volume size in GB (holds urwort.db)"
  type        = number
  default     = 20
}

# ── Object Storage (S3) — disabled for urwort ────────────────
# Uncomment if you add backup / asset storage later.
#
# variable "s3_endpoint" {
#   description = "Hetzner Object Storage endpoint"
#   type        = string
# }
#
# variable "s3_access_key" {
#   description = "S3 access key"
#   type        = string
#   sensitive   = true
# }
#
# variable "s3_secret_key" {
#   description = "S3 secret key"
#   type        = string
#   sensitive   = true
# }
#
# variable "s3_region" {
#   description = "S3 region identifier"
#   type        = string
#   default     = "nbg1"
# }
