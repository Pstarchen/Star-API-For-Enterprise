#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
project_dir="${STAR_API_PROJECT_DIR:-$(cd -- "$script_dir/.." && pwd)}"
project_dir="$(cd -- "$project_dir" && pwd)"
state_dir="${STAR_API_UPDATE_STATE_DIR:-$project_dir/.star-api-update}"
env_file="${STAR_API_ENV_FILE:-$project_dir/.env.production}"
compose_file="${STAR_API_COMPOSE_FILE:-$project_dir/compose.production.yml}"
request_dir="$state_dir/inbox/request"
processing_dir="$state_dir/processing"
status_file="$state_dir/status.json"
log_file="$state_dir/update.log"

for command in bash chmod chown date jq mv rm touch; do
  command -v "$command" >/dev/null 2>&1 || { echo "Required command is missing: $command" >&2; exit 1; }
done
[[ "$project_dir" == /* && "$project_dir" != "/" ]]
[[ "$state_dir" == /* && "$state_dir" != "/" ]]
[[ -f "$project_dir/scripts/update-production.sh" ]]
[[ -f "$env_file" && -f "$compose_file" ]]
[[ -d "$state_dir" && ! -L "$state_dir" && -d "$state_dir/inbox" && ! -L "$state_dir/inbox" ]]
[[ ! -L "$status_file" && ! -L "$log_file" ]]
request_id="invalid-request-$(date -u +%s)"
target_version=""
created_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

write_status() {
  local status="$1" conclusion="$2" updated_at temporary
  updated_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  temporary="${status_file}.tmp.$$"
  jq -n \
    --arg id "$request_id" \
    --arg version "$target_version" \
    --arg status "$status" \
    --arg conclusion "$conclusion" \
    --arg createdAt "$created_at" \
    --arg updatedAt "$updated_at" \
    '{id: $id, version: $version, status: $status, conclusion: (if $conclusion == "" then null else $conclusion end), createdAt: $createdAt, updatedAt: $updatedAt}' \
    > "$temporary"
  chown 0:1001 "$temporary"
  chmod 0640 "$temporary"
  mv -- "$temporary" "$status_file"
}

handle_failure() {
  local exit_code="$1" line="$2"
  set +e
  printf 'Local update failed at line %s with exit code %s.\n' "$line" "$exit_code" >> "$log_file"
  write_status completed failure
  rm -rf -- "$processing_dir"
  exit "$exit_code"
}

touch "$log_file"
chown 0:1001 "$log_file"
chmod 0640 "$log_file"
[[ -e "$request_dir" || -L "$request_dir" ]] || exit 0
[[ ! -e "$processing_dir" ]] || { echo "A local update is already processing." >&2; exit 0; }
mv -- "$request_dir" "$processing_dir"
trap 'handle_failure "$?" "$LINENO"' ERR

request_file="$processing_dir/request.json"
if [[ -L "$processing_dir" || ! -d "$processing_dir" ]]; then
  printf 'Rejected non-directory local update request.\n' >> "$log_file"
  handle_failure 2 "$LINENO"
fi
chown 0:1001 "$processing_dir"
chmod 0750 "$processing_dir"
if [[ -L "$request_file" || ! -f "$request_file" ]]; then
  printf 'Rejected unsafe local update request file.\n' >> "$log_file"
  handle_failure 2 "$LINENO"
fi
chown 0:1001 "$request_file"
chmod 0640 "$request_file"
if ! request_id="$(jq -er '.id | select(type == "string" and test("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"))' "$request_file" 2>/dev/null)" \
  || ! target_version="$(jq -er '.version | select(type == "string" and test("^[0-9]+\\.[0-9]+\\.[0-9]+$"))' "$request_file" 2>/dev/null)" \
  || ! created_at="$(jq -er '.requestedAt | select(type == "string" and test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z$"))' "$request_file" 2>/dev/null)"; then
  printf 'Rejected malformed local update request.\n' >> "$log_file"
  handle_failure 2 "$LINENO"
fi

write_status in_progress ""

exec >> "$log_file" 2>&1
printf '\n[%s] Starting local update %s -> %s (request %s).\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(sed -n 's/^STAR_API_VERSION=//p' "$env_file" | tail -n 1)" "$target_version" "$request_id"

STAR_API_PROJECT_DIR="$project_dir" \
STAR_API_ENV_FILE="$env_file" \
STAR_API_COMPOSE_FILE="$compose_file" \
STAR_API_USE_IMAGE_RELEASE_ASSETS=1 \
  bash "$project_dir/scripts/update-production.sh" "$target_version"

write_status completed success
rm -rf -- "$processing_dir"
trap - ERR
printf '[%s] Local update request %s completed.\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$request_id"
