#!/usr/bin/env bash
# wpdev — local WordPress environment from a backup in backup/ (macOS / Linux).
# The real logic lives in docker/scripts/setup.sh (runs inside Docker); this only orchestrates.
set -euo pipefail
cd "$(dirname "$0")"

dc() { docker compose "$@"; }

need_docker() {
  command -v docker >/dev/null 2>&1 || { echo "Docker not found. Install Docker Desktop: https://www.docker.com/products/docker-desktop/" >&2; exit 1; }
  docker info >/dev/null 2>&1 || { echo "Docker is not running. Start Docker Desktop and try again." >&2; exit 1; }
}

tty_flag() { [ -t 0 ] && [ -t 1 ] || echo "-T"; }

site_url() { grep -E '^SITE_URL=' .env 2>/dev/null | tail -n1 | cut -d= -f2- | tr -d '\r"'; }

usage() {
  cat <<'EOF'
Usage: ./wpdev.sh <command> [options]

  init [--yes] [--force]  Build the environment from backup/ (zip + sql)
  up                      Start the containers
  down                    Stop the containers (data is kept)
  open                    Open the site in your browser
  info                    Show URLs and credentials
  logs [service]          Follow logs (e.g. logs wordpress)
  wp <args>               Run WP-CLI (e.g. ./wpdev.sh wp plugin list)
  shell                   Open a shell in the WordPress container
  db-reimport             Re-import the .sql (discards database changes)
  db-dump                 Dump the local database to backup/dumps/
  destroy                 Remove containers and volumes (src/ and backup/ are kept)

  --yes    don't ask questions, use the values from .env / detected defaults
  --force  re-extract the zip and overwrite src/ (careful with your changes!)
EOF
}

cmd=${1:-help}; [ $# -gt 0 ] && shift

case "$cmd" in
  init)
    need_docker
    cfg=(); inst=()
    for a in "$@"; do
      case "$a" in
        --yes|-y) cfg+=(--yes) ;;
        --force)  inst+=(--force) ;;
        *) echo "Unknown option: $a" >&2; exit 1 ;;
      esac
    done
    dc build
    dc run --rm $(tty_flag) setup configure ${cfg[@]+"${cfg[@]}"}
    dc up -d --wait --remove-orphans
    dc exec -T database sh /scripts/import-db.sh
    dc run --rm -T setup install ${inst[@]+"${inst[@]}"}
    dc run --rm -T setup info
    ;;
  up)          need_docker; dc up -d --wait; dc run --rm -T setup info ;;
  down)        dc down ;;
  info)        dc run --rm -T setup info ;;
  open)
    url=$(site_url); [ -n "$url" ] || { echo "Run ./wpdev.sh init first." >&2; exit 1; }
    if command -v open >/dev/null; then open "$url"; else xdg-open "$url"; fi ;;
  logs)        dc logs -f --tail=100 "$@" ;;
  wp)          dc exec $(tty_flag) --user www-data wordpress wp "$@" ;;
  shell)       dc exec wordpress bash ;;
  db-reimport) need_docker; dc exec -T database sh /scripts/import-db.sh; dc run --rm -T setup fix-db ;;
  db-dump)     dc exec -T database sh /scripts/dump-db.sh ;;
  destroy)
    read -r -p "Remove containers and volumes (database + WordPress core)? src/ and backup/ are kept. [y/N] " ok
    case "$ok" in y|Y) dc down -v --remove-orphans ;; *) echo "Cancelled." ;; esac ;;
  help|-h|--help) usage ;;
  *) echo "Unknown command: $cmd" >&2; usage; exit 1 ;;
esac
