#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
project_dir="$(cd -- "$script_dir/.." && pwd)"
env_file="${STAR_API_ENV_FILE:-$project_dir/.env.production}"
compose_file="${STAR_API_COMPOSE_FILE:-$project_dir/compose.production.yml}"
repository="${STAR_API_REPOSITORY:-https://github.com/Pstarchen/Star-API-For-Enterprise.git}"
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

for command in awk chmod cp curl date docker flock git grep head mkdir mv rm sed seq sleep sort tail tar tr; do
  command -v "$command" >/dev/null 2>&1 || { echo "Required command is missing: $command" >&2; exit 1; }
done
[[ -f "$env_file" ]] || { echo "Environment file not found: $env_file" >&2; exit 1; }
[[ -f "$compose_file" ]] || { echo "Compose file not found: $compose_file" >&2; exit 1; }
docker compose version >/dev/null

exec 9>"$project_dir/.star-api-update.lock"
flock -n 9 || { echo "Another Star-API update is already running." >&2; exit 1; }

env_value() {
  local key="$1"
  sed -n "s/^${key}=//p" "$env_file" | tail -n 1 | tr -d '\r'
}

stable_versions() {
  git ls-remote --tags --refs "$repository" 'v*' \
    | awk '{ sub("refs/tags/v", "", $2); if ($2 ~ /^[0-9]+\.[0-9]+\.[0-9]+$/) print $2 }' \
    | sort -V
}

current_version="$(env_value STAR_API_VERSION)"
[[ "$current_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "STAR_API_VERSION is missing or invalid in $env_file" >&2; exit 1; }

if [[ "$requested_version" == "latest" ]]; then
  target_version="$(stable_versions | tail -n 1)"
else
  target_version="${requested_version#v}"
  [[ "$target_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Version must use X.Y.Z format." >&2; exit 2; }
  stable_versions | grep -Fxq "$target_version" || { echo "Release tag v$target_version does not exist in the configured repository." >&2; exit 1; }
fi
[[ -n "$target_version" ]] || { echo "No stable release tag was found." >&2; exit 1; }

app_image="$(env_value STAR_API_APP_IMAGE)"; app_image="${app_image:-ghcr.io/pstarchen/star-api-app}"
migrator_image="$(env_value STAR_API_MIGRATOR_IMAGE)"; migrator_image="${migrator_image:-ghcr.io/pstarchen/star-api-migrator}"
php_runner_image="$(env_value STAR_API_PHP_RUNNER_IMAGE)"; php_runner_image="${php_runner_image:-ghcr.io/pstarchen/star-api-php-runner}"

echo "Current version: $current_version"
echo "Target version:  $target_version"
for image in "$app_image" "$migrator_image" "$php_runner_image"; do
  echo "Checking $image:$target_version"
  docker manifest inspect "$image:$target_version" >/dev/null
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

backup_id="$(date -u +%Y%m%dT%H%M%SZ)-${current_version}-to-${target_version}"
backup_dir="$project_dir/backups/$backup_id"
mkdir -p "$backup_dir"
echo "Creating update backup: $backup_dir"
"${compose[@]}" exec -T postgres pg_dump -U starapi -d starapi -Fc > "$backup_dir/database.dump"
"${compose[@]}" run --rm --no-deps --user 0:0 -v "$backup_dir:/backup" app sh -c 'tar -C /var/lib/star-api/assets -czf /backup/assets.tar.gz .'
"${compose[@]}" run --rm --no-deps --entrypoint sh -v "$backup_dir:/backup" secrets-init -c 'tar -C /run/star-api-secrets -czf /backup/secrets.tar.gz .'
cp "$env_file" "$backup_dir/environment.before-update"

echo "Pulling release images while the current application remains online."
docker pull "$app_image:$target_version"
docker pull "$migrator_image:$target_version"
docker pull "$php_runner_image:$target_version"

next_env="${env_file}.star-api-update.$$"
cleanup_next_env() { rm -f "$next_env"; }
trap cleanup_next_env EXIT
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
