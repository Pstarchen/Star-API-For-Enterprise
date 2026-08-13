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
  "compose version"|"compose config") exit 0 ;;
  "manifest inspect") exit 0 ;;
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
  *"https://ghcr.io/v2/"*"/manifests/0.1.6"*)
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
console.log("Validated explicit and GHCR-discovered production update checks.");
