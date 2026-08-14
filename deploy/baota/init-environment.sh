#!/usr/bin/env bash
set -Eeuo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
env_file="$project_dir/.env.production.local"

if [[ -e "$env_file" ]]; then
  echo "Refusing to overwrite $env_file" >&2
  exit 1
fi

command -v node >/dev/null 2>&1 || { echo "Node.js 22 is required." >&2; exit 1; }
command -v openssl >/dev/null 2>&1 || { echo "OpenSSL is required." >&2; exit 1; }

read -r -p "Public URL (for example http://203.0.113.10:18081): " public_url
public_json="$(node -e '
  const url = new URL(process.argv[1]);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || (url.pathname !== "/" && url.pathname !== "")) process.exit(1);
  process.stdout.write(JSON.stringify({ origin: url.origin, hostname: url.hostname, secure: url.protocol === "https:" }));
' "$public_url")" || { echo "Public URL must be an HTTP(S) origin without a path." >&2; exit 1; }

read -r -p "PostgreSQL host [127.0.0.1]: " database_host
database_host="${database_host:-127.0.0.1}"
read -r -p "PostgreSQL port [5432]: " database_port
database_port="${database_port:-5432}"
read -r -p "PostgreSQL database [starapi]: " database_name
database_name="${database_name:-starapi}"
read -r -p "PostgreSQL user [starapi]: " database_user
database_user="${database_user:-starapi}"
read -r -s -p "PostgreSQL password: " database_password
printf '\n'

if [[ ${#database_password} -lt 12 ]]; then
  echo "PostgreSQL password must contain at least 12 characters." >&2
  exit 1
fi

public_origin="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).origin)' "$public_json")"
public_host="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).hostname)' "$public_json")"
cookie_secure="$(node -e 'process.stdout.write(String(JSON.parse(process.argv[1]).secure))' "$public_json")"
database_user_encoded="$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$database_user")"
database_password_encoded="$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$database_password")"
database_name_encoded="$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$database_name")"
app_version="$(node -p 'require(process.argv[1]).version' "$project_dir/package.json")"

php_cli_binary="/www/server/php/83/bin/php"
php_cgi_binary="/www/server/php/83/bin/php-cgi"
if [[ ! -x "$php_cli_binary" ]] && command -v php >/dev/null 2>&1; then php_cli_binary="$(command -v php)"; fi
if [[ ! -x "$php_cgi_binary" ]] && command -v php-cgi >/dev/null 2>&1; then php_cgi_binary="$(command -v php-cgi)"; fi

secret() { openssl rand -hex 32; }

umask 077
{
  printf 'NODE_ENV=production\n'
  printf 'APP_VERSION=%s\n' "$app_version"
  printf 'HOSTNAME=0.0.0.0\n'
  printf 'PORT=18081\n'
  printf 'DATABASE_URL=postgresql://%s:%s@%s:%s/%s?schema=public\n' "$database_user_encoded" "$database_password_encoded" "$database_host" "$database_port" "$database_name_encoded"
  printf 'REDIS_URL=redis://127.0.0.1:6379\n'
  printf 'API_KEY_PEPPER=%s\n' "$(secret)"
  printf 'SESSION_SECRET=%s\n' "$(secret)"
  printf 'INSTALL_TOKEN=%s\n' "$(secret)"
  printf 'INTERNAL_GATEWAY_SECRET=%s\n' "$(secret)"
  printf 'CONFIG_ENCRYPTION_KEY=%s\n' "$(secret)"
  printf 'SESSION_COOKIE_SECURE=%s\n' "$cookie_secure"
  printf 'API_PUBLIC_HOST=%s\n' "$public_host"
  printf 'API_PUBLIC_URL=%s\n' "$public_origin"
  printf 'LOCAL_UPSTREAM_HOSTS=127.0.0.1,localhost\n'
  printf 'PHP_RUNNER_URL=http://127.0.0.1:18082/execute\n'
  printf 'PHP_RUNNER_SECRET=%s\n' "$(secret)"
  printf 'PHP_CLI_BINARY=%s\n' "$php_cli_binary"
  printf 'PHP_CGI_BINARY=%s\n' "$php_cgi_binary"
  printf 'API_ASSET_STORAGE_PATH=%s/.data/api-assets\n' "$project_dir"
  printf 'MEDIA_MAX_API_GB=100\n'
  printf 'MEDIA_MAX_FILE_GB=2\n'
  printf 'MEDIA_MAX_ARCHIVE_GB=2\n'
  printf 'MEDIA_MAX_ARCHIVE_EXPANDED_GB=20\n'
} > "$env_file"

chmod 600 "$env_file"
mkdir -p "$project_dir/.data/api-assets"

echo "Environment created at $env_file"
echo "Secrets were written only to that file and were not printed."
echo "Next: bash deploy/baota/build.sh"
