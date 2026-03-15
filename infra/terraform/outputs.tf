# ============================================================
# urwort Infrastructure — Outputs
# ============================================================

output "server_ip" {
  description = "Public IPv4 of the urwort server"
  value       = hcloud_server.urwort.ipv4_address
}

output "server_id" {
  description = "Hetzner server ID"
  value       = hcloud_server.urwort.id
}

output "server_status" {
  description = "Server status"
  value       = hcloud_server.urwort.status
}

output "volume_mount" {
  description = "Volume mount path on the server"
  value       = "/mnt/${hcloud_volume.urwort_data.name}"
}

output "volume_id" {
  description = "Hetzner volume ID"
  value       = hcloud_volume.urwort_data.id
}

output "ssh_command" {
  description = "SSH command to connect"
  value       = "ssh root@${hcloud_server.urwort.ipv4_address}"
}

output "app_url" {
  description = "sslip.io URL (resolves automatically — no DNS needed)"
  value       = "http://${replace(hcloud_server.urwort.ipv4_address, ".", "-")}.sslip.io"
}
