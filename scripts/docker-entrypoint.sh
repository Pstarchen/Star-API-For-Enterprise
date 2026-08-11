#!/bin/sh
set -eu

secrets_dir="${STAR_API_SECRETS_DIR:-}"

load_secret() {
  name="$1"
  if [ -z "$secrets_dir" ]; then
    return
  fi

  source_file="$secrets_dir/$name"
  if [ -r "$source_file" ] && [ -s "$source_file" ]; then
    value="$(cat "$source_file")"
    export "$name=$value"
  fi
}

for secret_name in \
  POSTGRES_PASSWORD \
  API_KEY_PEPPER \
  SESSION_SECRET \
  INSTALL_TOKEN \
  INTERNAL_GATEWAY_SECRET \
  CONFIG_ENCRYPTION_KEY
do
  load_secret "$secret_name"
done

if [ -z "${DATABASE_URL:-}" ] && [ -n "${POSTGRES_PASSWORD:-}" ]; then
  export DATABASE_URL="postgresql://starapi:$POSTGRES_PASSWORD@${POSTGRES_HOST:-postgres}:5432/${POSTGRES_DB:-starapi}?schema=public"
fi

if [ -z "${PHP_RUNNER_SECRET:-}" ] && [ -n "${SESSION_SECRET:-}" ]; then
  export PHP_RUNNER_SECRET="$SESSION_SECRET"
fi

if [ "${NODE_ENV:-production}" = "production" ]; then
  for required_name in API_KEY_PEPPER SESSION_SECRET INSTALL_TOKEN INTERNAL_GATEWAY_SECRET CONFIG_ENCRYPTION_KEY
  do
    eval "required_value=\${$required_name:-}"
    if [ "${#required_value}" -lt 32 ]; then
      echo "$required_name must contain at least 32 characters." >&2
      exit 1
    fi
  done
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL or POSTGRES_PASSWORD is required." >&2
  exit 1
fi

exec "$@"
