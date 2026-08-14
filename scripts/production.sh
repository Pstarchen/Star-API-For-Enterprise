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
  enable-updates
                Enable host-local admin UI updates with a systemd path service.
  enable-github-updates
                Store a GitHub Actions token for compatibility fallback updates.
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

set_env_value() {
  local key="$1" value="$2" temp_file
  temp_file="${env_file}.tmp.$$"
  if [[ -f "$env_file" ]] && grep -q "^${key}=" "$env_file"; then
    awk -v key="$key" -v value="$value" '
      BEGIN { replaced = 0 }
      $0 ~ "^" key "=" { print key "=" value; replaced = 1; next }
      { print }
      END { if (!replaced) print key "=" value }
    ' "$env_file" > "$temp_file"
  else
    cp "$env_file" "$temp_file"
    printf '\n%s=%s\n' "$key" "$value" >> "$temp_file"
  fi
  chmod --reference="$env_file" "$temp_file" 2>/dev/null || chmod 600 "$temp_file" 2>/dev/null || true
  mv "$temp_file" "$env_file"
}

env_value() {
  local key="$1"
  sed -n "s/^${key}=//p" "$env_file" | tail -n 1 | tr -d '\r'
}

local_update_state_dir() {
  local configured
  configured="$(env_value STAR_API_UPDATE_STATE_DIR)"
  configured="${configured:-$project_dir/.star-api-update}"
  if [[ "$configured" == /* ]]; then
    printf '%s\n' "$configured"
  else
    printf '%s\n' "$project_dir/$configured"
  fi
}

configure_local_updates() {
  local state_dir default_proxies
  state_dir="$(local_update_state_dir)"
  [[ "$project_dir" =~ ^/[A-Za-z0-9._/-]+$ && "$state_dir" =~ ^/[A-Za-z0-9._/-]+$ ]] || {
    echo "Local updates require project and state paths without spaces or shell metacharacters." >&2
    exit 1
  }
  default_proxies="${STAR_API_DEFAULT_IMAGE_PROXIES:-ghcr.nju.edu.cn,ghcr.1ms.run,ghcr.chenby.cn}"
  [[ "$default_proxies" =~ ^[A-Za-z0-9.-]+(,[A-Za-z0-9.-]+)*$ ]] || { echo "STAR_API_DEFAULT_IMAGE_PROXIES is invalid." >&2; exit 1; }
  [[ ! -L "$state_dir" && ! -L "$state_dir/inbox" ]] || { echo "Local update directories must not be symbolic links." >&2; exit 1; }
  set_env_value STAR_API_UPDATE_STATE_DIR "$state_dir"
  if [[ -z "$(env_value STAR_API_IMAGE_PROXIES)" ]]; then set_env_value STAR_API_IMAGE_PROXIES "$default_proxies"; fi
  install -d -m 0750 -o 0 -g 1001 "$state_dir"
  install -d -m 0770 -o 1001 -g 1001 "$state_dir/inbox"
}

install_local_update_units() {
  local state_dir unit_dir temporary bash_path
  [[ "$EUID" -eq 0 ]] || { echo "Enable local updates as root so the systemd service can manage Docker." >&2; exit 1; }
  require_command install
  require_command mktemp
  require_command systemctl
  bash_path="$(command -v bash)"
  state_dir="$(local_update_state_dir)"
  unit_dir="/etc/systemd/system"
  mkdir -p "$project_dir/.deploy-tmp"
  temporary="$(mktemp -d "$project_dir/.deploy-tmp/systemd.XXXXXXXX")"
  cat > "$temporary/star-api-local-update.service" <<UNIT
[Unit]
Description=Star-API local production update
After=docker.service network-online.target
Requires=docker.service

[Service]
Type=oneshot
WorkingDirectory=$project_dir
Environment=STAR_API_PROJECT_DIR=$project_dir
Environment=STAR_API_ENV_FILE=$env_file
Environment=STAR_API_COMPOSE_FILE=$compose_file
Environment=STAR_API_UPDATE_STATE_DIR=$state_dir
ExecStart=$bash_path $project_dir/scripts/process-local-update.sh
TimeoutStartSec=0
UNIT
  cat > "$temporary/star-api-local-update.path" <<UNIT
[Unit]
Description=Watch for Star-API update requests

[Path]
PathExists=$state_dir/inbox/request
Unit=star-api-local-update.service

[Install]
WantedBy=multi-user.target
UNIT
  install -m 0644 "$temporary/star-api-local-update.service" "$unit_dir/star-api-local-update.service"
  install -m 0644 "$temporary/star-api-local-update.path" "$unit_dir/star-api-local-update.path"
  rm -rf -- "$temporary"
  install -m 0640 -o 0 -g 1001 /dev/null "$state_dir/enabled"
  systemctl daemon-reload
  systemctl enable --now star-api-local-update.path
}

enable_local_updates() {
  configure_local_updates
  compose up -d app
  install_local_update_units
  echo "Host-local platform updates are enabled."
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
    local_updates_available=0
    if [[ "$EUID" -eq 0 ]] && command -v systemctl >/dev/null 2>&1; then
      configure_local_updates
      local_updates_available=1
    fi
    compose config --quiet
    compose pull
    compose up -d
    if [[ "$local_updates_available" == "1" ]]; then
      install_local_update_units
    else
      echo "Run 'sudo bash scripts/production.sh enable-updates' to enable platform-admin updates."
    fi
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
  enable-updates)
    [[ $# -eq 0 ]] || { usage >&2; exit 2; }
    ensure_compose
    [[ -f "$env_file" ]] || { echo "Environment file not found: $env_file" >&2; exit 1; }
    enable_local_updates
    ;;
  enable-github-updates)
    [[ $# -eq 0 ]] || { usage >&2; exit 2; }
    ensure_compose
    [[ -f "$env_file" ]] || { echo "Environment file not found: $env_file" >&2; exit 1; }
    token="${STAR_API_GITHUB_TOKEN:-}"
    if [[ -z "$token" ]]; then
      printf 'GitHub Actions token: ' >&2
      old_stty="$(stty -g 2>/dev/null || true)"
      stty -echo 2>/dev/null || true
      IFS= read -r token
      [[ -z "$old_stty" ]] || stty "$old_stty" 2>/dev/null || true
      printf '\n' >&2
    fi
    [[ -n "$token" ]] || { echo "GitHub Actions token is required." >&2; exit 1; }
    printf '%s' "$token" | compose run --rm --no-deps --entrypoint sh -T secrets-init -c 'umask 077; cat > /run/star-api-secrets/GITHUB_ACTIONS_TOKEN.tmp && chmod 0444 /run/star-api-secrets/GITHUB_ACTIONS_TOKEN.tmp && mv /run/star-api-secrets/GITHUB_ACTIONS_TOKEN.tmp /run/star-api-secrets/GITHUB_ACTIONS_TOKEN'
    unset token
    set_env_value STAR_API_GITHUB_TOKEN_FILE /run/star-api-secrets/GITHUB_ACTIONS_TOKEN
    compose up -d app
    echo "GitHub Actions fallback updates are enabled."
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
