import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

if (process.platform === "win32") {
  console.log("Production updater behavior tests are deferred to Linux CI.");
  process.exit(0);
}

const root = mkdtempSync(join(tmpdir(), "star-api-updater-"));
const project = join(root, "project");
const bin = join(root, "bin");
const log = join(root, "commands.log");
mkdirSync(project);
mkdirSync(bin);
writeFileSync(join(project, ".env.production"), "STAR_API_VERSION=0.1.5\nAPP_PORT=18081\n");
writeFileSync(join(project, "compose.production.yml"), "name: updater-test\nservices: {}\n");

const docker = `#!/bin/sh
printf '%s\\n' "$*" >> "$STAR_API_TEST_LOG"
case "$1 $2" in
  "compose version") exit 0 ;;
  "manifest inspect") exit 0 ;;
  "image inspect") [ "\${STAR_API_TEST_IMAGE_LOCAL:-0}" = "1" ] && exit 0; exit 1 ;;
esac
case "$*" in
  compose*" config --quiet") exit 0 ;;
  compose*" ps --status running --quiet postgres") printf '%s\\n' postgres-test; exit 0 ;;
  compose*" exec -T postgres pg_dump"*) printf '%s\\n' test-dump; exit 0 ;;
  compose*" run "*|compose*" up -d"|compose*" ps") exit 0 ;;
  pull*) exit 0 ;;
esac
exit 0
`;
writeFileSync(join(bin, "docker"), docker, { mode: 0o700 });

const curl = `#!/bin/sh
printf 'curl %s\\n' "$*" >> "$STAR_API_TEST_LOG"
case "$*" in
  *"https://ghcr.io/token?scope=repository:"*":pull"*)
    printf '%s\\n' '{"token":"test-token"}'
    ;;
  *"https://ghcr.io/v2/pstarchen/star-api-app/tags/list"*)
    printf '%s\\n' '{"name":"pstarchen/star-api-app","tags":["sha-deadbeef","0.1.4","0.1.6-rc.1","0.1.6"]}'
    ;;
  *"https://updates.example.com/star-api/stable.json"*)
    printf '%s\n' '{"latestVersion":"0.1.6"}'
    ;;
  *"https://ghcr.io/v2/"*"/manifests/0.1.6"*)
    printf '%s\n' '{"manifests":[{"digest":"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","platform":{"os":"linux","architecture":"amd64"}}]}'
    ;;
  *"http://127.0.0.1:18081/api/health"*)
    printf '%s\\n' '{"version":"0.1.6","database":"connected"}'
    ;;
  *) exit 92 ;;
esac
`;
writeFileSync(join(bin, "curl"), curl, { mode: 0o700 });

const timeout = `#!/bin/sh
printf 'timeout %s\\n' "$*" >> "$STAR_API_TEST_LOG"
shift
exec "$@"
`;
writeFileSync(join(bin, "timeout"), timeout, { mode: 0o700 });

const updater = resolve("scripts/update-production.sh");
const result = spawnSync("bash", [updater, "--check", "0.1.6"], {
  cwd: project,
  encoding: "utf8",
  env: {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    STAR_API_PROJECT_DIR: project,
    STAR_API_TEST_LOG: log,
  },
});

assert.equal(result.status, 0, result.stderr || result.stdout);
assert.match(result.stdout, /Current version: 0\.1\.5/);
assert.match(result.stdout, /Target version:\s+0\.1\.6/);
assert.match(result.stdout, /An update is available\./);
const commands = readFileSync(log, "utf8");
assert.doesNotMatch(commands, /\/tags\/list/m, "Explicit-version checks must not discover a latest version");
assert.equal((commands.match(/\/manifests\/0\.1\.6$/gm) ?? []).length, 3);
assert.equal((commands.match(/^manifest inspect /gm) ?? []).length, 0);

writeFileSync(log, "");
const latestResult = spawnSync("bash", [updater, "--check"], {
  cwd: project,
  encoding: "utf8",
  env: {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    STAR_API_PROJECT_DIR: project,
    STAR_API_TEST_LOG: log,
  },
});

assert.equal(latestResult.status, 0, latestResult.stderr || latestResult.stdout);
assert.match(latestResult.stdout, /Target version:\s+0\.1\.6/);
const latestCommands = readFileSync(log, "utf8");
assert.equal((latestCommands.match(/\/tags\/list$/gm) ?? []).length, 1);
assert.equal((latestCommands.match(/\/manifests\/0\.1\.6$/gm) ?? []).length, 3);

writeFileSync(join(project, ".env.production"), "STAR_API_VERSION=0.1.5\nAPP_PORT=18081\nSTAR_API_UPDATE_FEED_URL=https://updates.example.com/star-api/stable.json\n");
writeFileSync(log, "");
const feedResult = spawnSync("bash", [updater, "--check"], {
  cwd: project,
  encoding: "utf8",
  env: {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    STAR_API_PROJECT_DIR: project,
    STAR_API_TEST_LOG: log,
  },
});
assert.equal(feedResult.status, 0, feedResult.stderr || feedResult.stdout);
const feedCommands = readFileSync(log, "utf8");
assert.equal((feedCommands.match(/updates\.example\.com\/star-api\/stable\.json$/gm) ?? []).length, 1);
assert.doesNotMatch(feedCommands, /\/tags\/list$/m);

writeFileSync(log, "");
const localImagesResult = spawnSync("bash", [updater, "--check", "0.1.6"], {
  cwd: project,
  encoding: "utf8",
  env: {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    STAR_API_PROJECT_DIR: project,
    STAR_API_TEST_LOG: log,
    STAR_API_TEST_IMAGE_LOCAL: "1",
  },
});
assert.equal(localImagesResult.status, 0, localImagesResult.stderr || localImagesResult.stdout);
assert.doesNotMatch(readFileSync(log, "utf8"), /\/manifests\/0\.1\.6$/m);

writeFileSync(log, "");
const updateResult = spawnSync("bash", [updater, "0.1.6"], {
  cwd: project,
  encoding: "utf8",
  env: {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    STAR_API_PROJECT_DIR: project,
    STAR_API_TEST_LOG: log,
  },
});

assert.equal(updateResult.status, 0, updateResult.stderr || updateResult.stdout);
assert.match(updateResult.stdout, /Update completed: 0\.1\.5 -> 0\.1\.6/);
assert.equal(readFileSync(join(project, ".env.production"), "utf8").match(/^STAR_API_VERSION=(.+)$/m)?.[1], "0.1.6");
const updateCommands = readFileSync(log, "utf8");
assert.equal((updateCommands.match(/^timeout 1800 docker pull /gm) ?? []).length, 3);
assert.equal((updateCommands.match(/^image inspect /gm) ?? []).length, 6);
assert.match(updateCommands, /compose .* run --rm --no-deps secrets-init/);
assert.match(updateCommands, /compose .* run --rm --no-deps migrate/);
assert.match(updateCommands, /compose .* up -d --no-deps --wait --wait-timeout 90 php-runner/);
assert.match(updateCommands, /compose .* up -d --no-deps app/);
assert.doesNotMatch(updateCommands, /compose .* up -d$/m, "Updates must not recreate the database and cache with a broad Compose up");
assert.ok(updateCommands.indexOf("run --rm --no-deps migrate") < updateCommands.indexOf("up -d --no-deps app"), "Migrations must finish before replacing the web application");

writeFileSync(join(project, ".env.production"), "STAR_API_VERSION=0.1.5\nAPP_PORT=18081\nSTAR_API_IMAGE_PULL_TIMEOUT=900\n");
writeFileSync(log, "");
const customTimeoutResult = spawnSync("bash", [updater, "0.1.6"], {
  cwd: project,
  encoding: "utf8",
  env: {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    STAR_API_PROJECT_DIR: project,
    STAR_API_TEST_LOG: log,
  },
});

assert.equal(customTimeoutResult.status, 0, customTimeoutResult.stderr || customTimeoutResult.stdout);
assert.equal((readFileSync(log, "utf8").match(/^timeout 900 docker pull /gm) ?? []).length, 3);

writeFileSync(join(project, ".env.production"), "STAR_API_VERSION=0.1.5\nAPP_PORT=18081\nSTAR_API_IMAGE_PULL_TIMEOUT=900\nSTAR_API_UPDATE_REGION=cn\nSTAR_API_IMAGE_PROXIES=ghcr.nju.edu.cn\n");
writeFileSync(log, "");
const proxyResult = spawnSync("bash", [updater, "0.1.6"], {
  cwd: project,
  encoding: "utf8",
  env: {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    STAR_API_PROJECT_DIR: project,
    STAR_API_TEST_LOG: log,
  },
});

assert.equal(proxyResult.status, 0, proxyResult.stderr || proxyResult.stdout);
const proxyCommands = readFileSync(log, "utf8");
assert.equal((proxyCommands.match(/^timeout 900 docker pull --platform linux\/amd64 ghcr\.nju\.edu\.cn\/pstarchen\/star-api-[^@]+@sha256:a{64}$/gm) ?? []).length, 3);
assert.equal((proxyCommands.match(/^tag ghcr\.nju\.edu\.cn\/pstarchen\/star-api-[^@]+@sha256:a{64} ghcr\.io\/pstarchen\/star-api-[^:]+:0\.1\.6$/gm) ?? []).length, 3);
assert.equal((proxyCommands.match(/^timeout 900 docker pull ghcr\.io\//gm) ?? []).length, 0);

writeFileSync(join(project, ".env.production"), "STAR_API_VERSION=0.1.5\nAPP_PORT=18081\nSTAR_API_IMAGE_PULL_TIMEOUT=900\nSTAR_API_UPDATE_REGION=global\nSTAR_API_IMAGE_PROXIES=ghcr.nju.edu.cn\n");
writeFileSync(log, "");
const globalResult = spawnSync("bash", [updater, "0.1.6"], {
  cwd: project,
  encoding: "utf8",
  env: {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    STAR_API_PROJECT_DIR: project,
    STAR_API_TEST_LOG: log,
  },
});
assert.equal(globalResult.status, 0, globalResult.stderr || globalResult.stdout);
const globalCommands = readFileSync(log, "utf8");
assert.equal((globalCommands.match(/^timeout 900 docker pull ghcr\.io\//gm) ?? []).length, 3);
assert.equal((globalCommands.match(/^timeout 900 docker pull --platform /gm) ?? []).length, 0);

writeFileSync(join(project, ".env.production"), "STAR_API_VERSION=0.1.5\nSTAR_API_IMAGE_PULL_TIMEOUT=30\n");
const invalidTimeoutResult = spawnSync("bash", [updater, "--check", "0.1.6"], {
  cwd: project,
  encoding: "utf8",
  env: {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    STAR_API_PROJECT_DIR: project,
    STAR_API_TEST_LOG: log,
  },
});

assert.equal(invalidTimeoutResult.status, 2);
assert.match(invalidTimeoutResult.stderr, /STAR_API_IMAGE_PULL_TIMEOUT must be an integer between 60 and 7200 seconds/);

writeFileSync(join(project, ".env.production"), "STAR_API_VERSION=0.1.5\nSTAR_API_UPDATE_REGION=unknown\n");
const invalidRegionResult = spawnSync("bash", [updater, "--check", "0.1.6"], {
  cwd: project,
  encoding: "utf8",
  env: {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    STAR_API_PROJECT_DIR: project,
    STAR_API_TEST_LOG: log,
  },
});
assert.equal(invalidRegionResult.status, 2);
assert.match(invalidRegionResult.stderr, /STAR_API_UPDATE_REGION must be auto, cn, or global/);
console.log("Validated explicit and GHCR-discovered production update checks.");
