#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
project_dir="${STAR_API_PROJECT_DIR:-$(cd -- "$script_dir/.." && pwd)}"
project_dir="$(cd -- "$project_dir" && pwd)"
env_file="${STAR_API_ENV_FILE:-$project_dir/.env.production}"
compose_file="${STAR_API_COMPOSE_FILE:-$project_dir/compose.production.yml}"
next_compose_file="${STAR_API_NEXT_COMPOSE_FILE:-}"
mode="update"

usage() {
  printf '%s\n' \
    "Usage: bash scripts/update-production.sh [--check] [VERSION]" \
    "" \
    "  --check   Only report the newest stable version and image availability." \
    "  VERSION   Upgrade to this X.Y.Z version; defaults to the latest tag."
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then usage; exit 0; fi
if [[ "${1:-}" == "--check" ]]; then mode="check"; shift; fi
if [[ $# -gt 1 ]]; then usage >&2; exit 2; fi
requested_version="${1:-latest}"

for command in awk chmod cp curl date docker flock grep head jq mkdir mv rm sed seq sleep sort tail tar timeout tr; do
  command -v "$command" >/dev/null 2>&1 || { echo "Required command is missing: $command" >&2; exit 1; }
done
[[ -f "$env_file" ]] || { echo "Environment file not found: $env_file" >&2; exit 1; }
[[ -f "$compose_file" ]] || { echo "Compose file not found: $compose_file" >&2; exit 1; }
if [[ -n "$next_compose_file" ]]; then
  [[ -f "$next_compose_file" ]] || { echo "Next Compose file not found: $next_compose_file" >&2; exit 1; }
  [[ "$(cd -- "$(dirname -- "$next_compose_file")" && pwd)/$(basename -- "$next_compose_file")" != "$compose_file" ]] || {
    echo "STAR_API_NEXT_COMPOSE_FILE must differ from the active Compose file." >&2
    exit 1
  }
fi
docker compose version >/dev/null

exec 9>"$project_dir/.star-api-update.lock"
flock -n 9 || { echo "Another Star-API update is already running." >&2; exit 1; }

env_value() {
  local key="$1"
  sed -n "s/^${key}=//p" "$env_file" | tail -n 1 | tr -d '\r'
}

current_version="$(env_value STAR_API_VERSION)"
[[ "$current_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "STAR_API_VERSION is missing or invalid in $env_file" >&2; exit 1; }

app_image="$(env_value STAR_API_APP_IMAGE)"; app_image="${app_image:-ghcr.io/pstarchen/star-api-app}"
migrator_image="$(env_value STAR_API_MIGRATOR_IMAGE)"; migrator_image="${migrator_image:-ghcr.io/pstarchen/star-api-migrator}"
php_runner_image="$(env_value STAR_API_PHP_RUNNER_IMAGE)"; php_runner_image="${php_runner_image:-ghcr.io/pstarchen/star-api-php-runner}"
image_pull_timeout="${STAR_API_IMAGE_PULL_TIMEOUT:-$(env_value STAR_API_IMAGE_PULL_TIMEOUT)}"
image_pull_timeout="${image_pull_timeout:-1800}"
if [[ ! "$image_pull_timeout" =~ ^[0-9]+$ ]] || (( image_pull_timeout < 60 || image_pull_timeout > 7200 )); then
  echo "STAR_API_IMAGE_PULL_TIMEOUT must be an integer between 60 and 7200 seconds." >&2
  exit 2
fi
backup_keep="${STAR_API_BACKUP_KEEP:-$(env_value STAR_API_BACKUP_KEEP)}"
backup_keep="${backup_keep:-3}"
if [[ ! "$backup_keep" =~ ^[0-9]+$ ]] || (( backup_keep < 1 || backup_keep > 30 )); then
  echo "STAR_API_BACKUP_KEEP must be an integer between 1 and 30." >&2
  exit 2
fi

ghcr_repository() {
  local image="${1#ghcr.io/}"
  [[ "$1" == ghcr.io/* && "$image" == */* && "$image" != *:* ]] || {
    echo "Latest-version discovery requires an untagged ghcr.io image repository: $1" >&2
    return 1
  }
  printf '%s\n' "$image"
}

stable_versions() {
  local image_repository token
  image_repository="$(ghcr_repository "$app_image")"
  token="$(ghcr_token "$image_repository")"
  curl --fail --silent --show-error --connect-timeout 8 --max-time 20 \
    -H "Authorization: Bearer $token" \
    "https://ghcr.io/v2/${image_repository}/tags/list" \
    | jq -er '.tags // [] | .[]' \
    | grep -E '^[0-9]+\.[0-9]+\.[0-9]+$' \
    | sort -Vu
}

ghcr_token() {
  local image_repository="$1"
  curl --fail --silent --show-error --connect-timeout 8 --max-time 20 \
    "https://ghcr.io/token?scope=repository:${image_repository}:pull" \
    | jq -er '.token // .access_token'
}

image_manifest_exists() {
  local image="$1"
  local version="$2"
  if [[ "$image" != ghcr.io/* ]]; then
    timeout 45 docker manifest inspect "$image:$version" >/dev/null
    return
  fi

  local image_repository token
  image_repository="$(ghcr_repository "$image")"
  token="$(ghcr_token "$image_repository")"
  curl --fail --silent --show-error --connect-timeout 8 --max-time 25 \
    -H "Authorization: Bearer $token" \
    -H 'Accept: application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json' \
    -o /dev/null \
    "https://ghcr.io/v2/${image_repository}/manifests/${version}"
}

image_available_locally() {
  local image="$1"
  local version="$2"
  docker image inspect "$image:$version" >/dev/null 2>&1
}

pull_image() {
  local image="$1"
  local version="$2"
  if image_available_locally "$image" "$version"; then
    echo "Image is already present locally: $image:$version"
    return 0
  fi
  timeout "$image_pull_timeout" docker pull "$image:$version"
}

retry_command() {
  local description="$1"
  local attempts="$2"
  local delay="$3"
  shift 3
  local attempt
  for attempt in $(seq 1 "$attempts"); do
    if "$@"; then return 0; fi
    if [[ "$attempt" == "$attempts" ]]; then
      echo "$description failed after $attempts attempts." >&2
      return 1
    fi
    echo "$description failed (attempt $attempt/$attempts); retrying in ${delay}s." >&2
    sleep "$delay"
  done
}

prune_update_space() {
  local backups_dir="$project_dir/backups"
  mkdir -p "$backups_dir"
  if (( backup_keep > 0 )); then
    find "$backups_dir" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' \
      | sort -nr \
      | awk -v keep="$backup_keep" 'NR > keep { sub(/^[^ ]+ /, ""); print }' \
      | while IFS= read -r old_backup; do
          [[ "$old_backup" == "$backups_dir"/* ]] && rm -rf -- "$old_backup"
        done
  fi
  docker builder prune --force --filter until=24h >/dev/null 2>&1 || true
  docker image prune --force >/dev/null 2>&1 || true
}

backup_assets() {
  "${compose[@]}" run --rm --no-deps --user 0:0 -v "$backup_dir:/backup" app sh -c 'tar -C /var/lib/star-api/assets -czf /backup/assets.tar.gz .'
}

if [[ "$requested_version" == "latest" ]]; then
  target_version="$(retry_command "Latest-version discovery from GHCR" 3 8 stable_versions | tail -n 1)"
else
  target_version="${requested_version#v}"
  [[ "$target_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Version must use X.Y.Z format." >&2; exit 2; }
fi
[[ -n "$target_version" ]] || { echo "No stable release image was found." >&2; exit 1; }

echo "Current version: $current_version"
echo "Target version:  $target_version"

for image in "$app_image" "$migrator_image" "$php_runner_image"; do
  echo "Checking $image:$target_version"
  retry_command "Image check for $image:$target_version" 5 8 image_manifest_exists "$image" "$target_version"
done

if [[ "$mode" == "check" ]]; then
  if [[ "$current_version" == "$target_version" ]]; then echo "Star-API is up to date."; else echo "An update is available."; fi
  exit 0
fi
if [[ "$current_version" == "$target_version" ]]; then echo "Star-API is already running $target_version."; exit 0; fi

current_precedes_target="$(printf '%s\n%s\n' "$current_version" "$target_version" | sort -V | head -n 1)"
if [[ "$current_precedes_target" != "$current_version" && "${STAR_API_ALLOW_DOWNGRADE:-0}" != "1" ]]; then
  echo "Refusing to downgrade from $current_version to $target_version. Review database compatibility before setting STAR_API_ALLOW_DOWNGRADE=1." >&2
  exit 1
fi

compose=(docker compose --env-file "$env_file" -f "$compose_file")
"${compose[@]}" config --quiet
"${compose[@]}" ps --status running --quiet postgres | grep -q . || { echo "PostgreSQL is not running; start the current deployment before updating." >&2; exit 1; }

prune_update_space
backup_id="$(date -u +%Y%m%dT%H%M%SZ)-${current_version}-to-${target_version}"
backup_dir="$project_dir/backups/$backup_id"
mkdir -p "$backup_dir"
echo "Creating update backup: $backup_dir"
"${compose[@]}" exec -T postgres pg_dump -U starapi -d starapi -Fc > "$backup_dir/database.dump"
if ! backup_assets; then
  echo "Asset backup failed. Pruning old backups and Docker cache once before retrying." >&2
  prune_update_space
  backup_assets
fi
"${compose[@]}" run --rm --no-deps --entrypoint sh -v "$backup_dir:/backup" secrets-init -c 'tar -C /run/star-api-secrets -czf /backup/secrets.tar.gz .'
cp "$env_file" "$backup_dir/environment.before-update"
cp "$compose_file" "$backup_dir/compose.before-update.yml"

echo "Pulling release images while the current application remains online."
retry_command "Image pull for $app_image:$target_version" 3 12 pull_image "$app_image" "$target_version"
retry_command "Image pull for $migrator_image:$target_version" 3 12 pull_image "$migrator_image" "$target_version"
retry_command "Image pull for $php_runner_image:$target_version" 3 12 pull_image "$php_runner_image" "$target_version"

next_env="${env_file}.star-api-update.$$"
next_compose="${compose_file}.star-api-update.$$"
cleanup_staged_files() { rm -f "$next_env" "$next_compose"; }
trap cleanup_staged_files EXIT

if [[ -n "$next_compose_file" ]]; then
  cp "$next_compose_file" "$next_compose"
  chmod --reference="$compose_file" "$next_compose"
  mv "$next_compose" "$compose_file"
fi

awk -v version="$target_version" '
  BEGIN { replaced = 0 }
  /^STAR_API_VERSION=/ { print "STAR_API_VERSION=" version; replaced = 1; next }
  { print }
  END { if (!replaced) print "STAR_API_VERSION=" version }
' "$env_file" > "$next_env"
chmod --reference="$env_file" "$next_env"
mv "$next_env" "$env_file"

if ! "${compose[@]}" config --quiet; then
  cp "$backup_dir/environment.before-update" "$next_env"
  chmod --reference="$env_file" "$next_env"
  mv "$next_env" "$env_file"
  cp "$backup_dir/compose.before-update.yml" "$next_compose"
  chmod --reference="$compose_file" "$next_compose"
  mv "$next_compose" "$compose_file"
  echo "Target Compose configuration is invalid; restored STAR_API_VERSION=$current_version before any migration started." >&2
  exit 1
fi
echo "Starting Star-API $target_version and applying forward database migrations."
if ! "${compose[@]}" up -d; then
  echo "Compose failed while starting the target version." >&2
  echo "The environment remains pinned to $target_version because migrations may already have run." >&2
  echo "Inspect logs with: docker compose --env-file '$env_file' -f '$compose_file' logs --tail=200 migrate app" >&2
  echo "Backup: $backup_dir" >&2
  exit 1
fi

app_port="$(env_value APP_PORT)"; app_port="${app_port:-18081}"
health_url="${STAR_API_HEALTH_URL:-http://127.0.0.1:${app_port}/api/health}"
health_body="$backup_dir/health.json"
healthy=0
for _ in $(seq 1 36); do
  if curl --fail --silent --show-error --max-time 8 "$health_url" > "$health_body" 2>/dev/null \
    && grep -Eq "\"version\"[[:space:]]*:[[:space:]]*\"${target_version}\"" "$health_body" \
    && grep -Eq '"database"[[:space:]]*:[[:space:]]*"connected"' "$health_body"; then
    healthy=1
    break
  fi
  sleep 5
done

if [[ "$healthy" != "1" ]]; then
  echo "Star-API did not become healthy on $health_url within 180 seconds." >&2
  "${compose[@]}" ps >&2 || true
  "${compose[@]}" logs --tail=200 migrate app php-runner >&2 || true
  echo "Automatic image rollback is disabled after migrations. Backup: $backup_dir" >&2
  exit 1
fi

"${compose[@]}" ps
echo "Update completed: $current_version -> $target_version"
echo "Verified health endpoint: $health_url"
echo "Backup retained at: $backup_dir"
