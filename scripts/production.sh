#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
project_dir="${STAR_API_PROJECT_DIR:-$(cd -- "$script_dir/.." && pwd)}"
project_dir="$(cd -- "$project_dir" && pwd)"
env_file="${STAR_API_ENV_FILE:-$project_dir/.env.production}"
compose_file="${STAR_API_COMPOSE_FILE:-$project_dir/compose.production.yml}"

usage() {
  cat <<'USAGE'
Usage: bash scripts/production.sh <command> [version]

Commands:
  install       Create .env.production when missing, pull images, and start Star-API.
  update        Back up, update to the latest stable image, run migrations, and verify health.
  update X.Y.Z  Update to a specific stable version.
  check         Check whether a newer stable image is available.
  token         Print the first-install token from the running app container.
  status        Show production container status.
  logs          Follow recent app, migrator, postgres, redis, and php-runner logs.

Environment overrides:
  STAR_API_ENV_FILE       Defaults to .env.production.
  STAR_API_COMPOSE_FILE   Defaults to compose.production.yml.
  STAR_API_PROJECT_DIR    Defaults to this repository.
USAGE
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || { echo "Required command is missing: $1" >&2; exit 1; }
}

ensure_compose() {
  require_command docker
  docker compose version >/dev/null
  [[ -f "$compose_file" ]] || { echo "Compose file not found: $compose_file" >&2; exit 1; }
}

ensure_env() {
  if [[ -f "$env_file" ]]; then return; fi
  local example="$project_dir/.env.production.example"
  [[ -f "$example" ]] || { echo "Environment file not found and example is missing: $example" >&2; exit 1; }
  cp "$example" "$env_file"
  chmod 600 "$env_file" 2>/dev/null || true
  echo "Created $env_file from .env.production.example."
  echo "Review SITE_ADDRESS, API_PUBLIC_URL, API_PUBLIC_HOST, and APP_PORT before exposing the service."
}

compose() {
  docker compose --env-file "$env_file" -f "$compose_file" "$@"
}

command_name="${1:-}"
if [[ -z "$command_name" || "$command_name" == "--help" || "$command_name" == "-h" ]]; then
  usage
  exit 0
fi
shift || true

case "$command_name" in
  install)
    [[ $# -eq 0 ]] || { usage >&2; exit 2; }
    ensure_compose
    ensure_env
    compose config --quiet
    compose pull
    compose up -d
    compose ps
    ;;
  check)
    [[ $# -eq 0 ]] || { usage >&2; exit 2; }
    ensure_compose
    [[ -f "$env_file" ]] || { echo "Environment file not found: $env_file" >&2; exit 1; }
    STAR_API_PROJECT_DIR="$project_dir" STAR_API_ENV_FILE="$env_file" STAR_API_COMPOSE_FILE="$compose_file" bash "$script_dir/update-production.sh" --check
    ;;
  update)
    [[ $# -le 1 ]] || { usage >&2; exit 2; }
    ensure_compose
    [[ -f "$env_file" ]] || { echo "Environment file not found: $env_file" >&2; exit 1; }
    STAR_API_PROJECT_DIR="$project_dir" STAR_API_ENV_FILE="$env_file" STAR_API_COMPOSE_FILE="$compose_file" bash "$script_dir/update-production.sh" "${1:-}"
    ;;
  token)
    [[ $# -eq 0 ]] || { usage >&2; exit 2; }
    ensure_compose
    [[ -f "$env_file" ]] || { echo "Environment file not found: $env_file" >&2; exit 1; }
    compose exec app node /app/scripts/show-install-token.mjs
    ;;
  status)
    [[ $# -eq 0 ]] || { usage >&2; exit 2; }
    ensure_compose
    [[ -f "$env_file" ]] || { echo "Environment file not found: $env_file" >&2; exit 1; }
    compose ps
    ;;
  logs)
    [[ $# -eq 0 ]] || { usage >&2; exit 2; }
    ensure_compose
    [[ -f "$env_file" ]] || { echo "Environment file not found: $env_file" >&2; exit 1; }
    compose logs -f --tail=200 app migrate postgres redis php-runner
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac
