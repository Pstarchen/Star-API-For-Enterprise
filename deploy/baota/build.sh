#!/usr/bin/env bash
set -Eeuo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
env_file="$project_dir/.env.production.local"
cd "$project_dir"

[[ -r "$env_file" ]] || { echo "Run deploy/baota/init-environment.sh first." >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo "Node.js 22 is required." >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "npm is required." >&2; exit 1; }

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if (( node_major < 22 )); then
  echo "Node.js 22 or newer is required; found $(node --version)." >&2
  exit 1
fi

npm ci --no-audit --no-fund
node --env-file="$env_file" node_modules/prisma/build/index.js generate
node --env-file="$env_file" node_modules/prisma/build/index.js migrate deploy
node --env-file="$env_file" node_modules/next/dist/bin/next build

mkdir -p .next/standalone/public .next/standalone/.next/static .data/api-assets
cp -a public/. .next/standalone/public/
cp -a .next/static/. .next/standalone/.next/static/

if [[ $(id -u) -eq 0 ]] && id www >/dev/null 2>&1; then
  chown -R www:www .next .data
  chown root:www "$env_file"
  chmod 640 "$env_file"
fi

echo "Standalone release is ready at $project_dir/.next/standalone"
echo "Next: pm2 startOrReload deploy/baota/ecosystem.config.cjs --update-env"
