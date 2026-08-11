#!/bin/sh
set -eu

if [ -z "${RUNNER_SECRET:-}" ] && [ -n "${STAR_API_SECRETS_DIR:-}" ]; then
  source_file="$STAR_API_SECRETS_DIR/SESSION_SECRET"
  if [ -r "$source_file" ] && [ -s "$source_file" ]; then
    RUNNER_SECRET="$(cat "$source_file")"
    export RUNNER_SECRET
  fi
fi

runner_secret="${RUNNER_SECRET:-}"
if [ "${#runner_secret}" -lt 32 ]; then
  echo "RUNNER_SECRET must contain at least 32 characters." >&2
  exit 1
fi

exec "$@"
