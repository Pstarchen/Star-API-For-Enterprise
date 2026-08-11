#!/bin/sh
set -eu

secrets_dir="${STAR_API_SECRETS_DIR:-/run/star-api-secrets}"
umask 077
mkdir -p "$secrets_dir"
chmod 0755 "$secrets_dir"

generate_secret() {
  name="$1"
  target="$secrets_dir/$name"

  if [ -e "$target" ]; then
    value="$(cat "$target")"
    if [ "${#value}" -lt 32 ]; then
      echo "Deployment secret $name is invalid." >&2
      exit 1
    fi
    chmod 0444 "$target"
    return
  fi

  eval "configured_value=\${$name:-}"
  if [ -n "$configured_value" ]; then
    if [ "${#configured_value}" -lt 32 ]; then
      echo "Configured deployment secret $name is invalid." >&2
      exit 1
    fi
    value="$configured_value"
  else
    value="$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')"
    if [ "${#value}" -ne 64 ]; then
      echo "Unable to generate deployment secret $name." >&2
      exit 1
    fi
  fi

  temporary="$target.tmp.$$"
  printf '%s\n' "$value" > "$temporary"
  chmod 0444 "$temporary"
  mv "$temporary" "$target"
}

for secret_name in \
  POSTGRES_PASSWORD \
  API_KEY_PEPPER \
  SESSION_SECRET \
  INSTALL_TOKEN \
  INTERNAL_GATEWAY_SECRET \
  CONFIG_ENCRYPTION_KEY
do
  generate_secret "$secret_name"
done

echo "Deployment secrets are ready."
