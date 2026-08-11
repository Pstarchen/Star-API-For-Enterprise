#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $(id -u) -ne 0 ]]; then
  echo "Run this script as root." >&2
  exit 1
fi

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
env_file="$project_dir/.env.production.local"
unit_file="/etc/systemd/system/star-api-php-runner.service"

[[ -r "$env_file" ]] || { echo "$env_file does not exist." >&2; exit 1; }
[[ "$project_dir" != *[' %']* ]] || { echo "The project path cannot contain spaces or percent signs." >&2; exit 1; }

php_cli="$(node --env-file="$env_file" -p 'process.env.PHP_CLI_BINARY || ""')"
php_cgi="$(node --env-file="$env_file" -p 'process.env.PHP_CGI_BINARY || ""')"
[[ -x "$php_cli" ]] || { echo "PHP_CLI_BINARY is not executable: $php_cli" >&2; exit 1; }
[[ -x "$php_cgi" ]] || { echo "PHP_CGI_BINARY is not executable: $php_cgi" >&2; exit 1; }

if ! id starapi-runner >/dev/null 2>&1; then
  useradd --system --no-create-home --shell /usr/sbin/nologin starapi-runner
fi

cat > "$unit_file" <<EOF
[Unit]
Description=Star-API isolated PHP runner
After=network.target

[Service]
Type=simple
User=starapi-runner
Group=starapi-runner
WorkingDirectory=$project_dir/php-runner
EnvironmentFile=$env_file
ExecStart=$php_cli -d variables_order=EGPCS -S 127.0.0.1:18082 $project_dir/php-runner/server.php
Restart=on-failure
RestartSec=2
TimeoutStopSec=15
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
LockPersonality=true
CapabilityBoundingSet=
AmbientCapabilities=
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
IPAddressDeny=any
IPAddressAllow=localhost
MemoryMax=256M
TasksMax=64

[Install]
WantedBy=multi-user.target
EOF

chmod 644 "$unit_file"
systemctl daemon-reload
systemctl enable --now star-api-php-runner.service

if ! curl --fail --silent --show-error http://127.0.0.1:18082/health >/dev/null; then
  systemctl status --no-pager star-api-php-runner.service || true
  exit 1
fi

echo "Star-API PHP runner is healthy on 127.0.0.1:18082."
