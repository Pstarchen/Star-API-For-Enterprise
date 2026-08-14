import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

if (process.platform === "win32") {
  console.log("Local update worker behavior tests are deferred to Linux CI.");
  process.exit(0);
}

const root = mkdtempSync(join(tmpdir(), "star-api-local-worker-"));
const project = join(root, "project");
const state = join(project, ".star-api-update");
const scripts = join(project, "scripts");
const bin = join(root, "bin");
const updaterLog = join(root, "updater.log");
mkdirSync(project);
mkdirSync(state);
mkdirSync(join(state, "inbox"));
mkdirSync(scripts);
mkdirSync(bin);
writeFileSync(join(project, ".env.production"), "STAR_API_VERSION=0.1.14\n");
writeFileSync(join(project, "compose.production.yml"), "name: local-worker-test\nservices: {}\n");
writeFileSync(join(bin, "chown"), "#!/bin/sh\nexit 0\n", { mode: 0o700 });
writeFileSync(join(scripts, "update-production.sh"), `#!/bin/sh
printf '%s\\n' "$*" >> "$STAR_API_TEST_UPDATER_LOG"
exit "\${STAR_API_TEST_UPDATE_EXIT:-0}"
`, { mode: 0o700 });

const worker = resolve("scripts/process-local-update.sh");

function request(id, version) {
  const requestDir = join(state, "inbox", "request");
  mkdirSync(requestDir);
  writeFileSync(join(requestDir, "request.json"), `${JSON.stringify({ id, version, requestedAt: "2026-08-14T00:00:00.000Z" })}\n`);
}

request("11111111-1111-4111-8111-111111111111", "0.1.15");
const success = spawnSync("bash", [worker], {
  encoding: "utf8",
  env: {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    STAR_API_PROJECT_DIR: project,
    STAR_API_UPDATE_STATE_DIR: state,
    STAR_API_TEST_UPDATER_LOG: updaterLog,
  },
});
assert.equal(success.status, 0, success.stderr || success.stdout);
assert.equal(JSON.parse(readFileSync(join(state, "status.json"), "utf8")).conclusion, "success");
assert.equal(existsSync(join(state, "processing")), false);
assert.equal(readFileSync(updaterLog, "utf8").trim(), "0.1.15");

request("22222222-2222-4222-8222-222222222222", "0.1.16");
const failure = spawnSync("bash", [worker], {
  encoding: "utf8",
  env: {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    STAR_API_PROJECT_DIR: project,
    STAR_API_UPDATE_STATE_DIR: state,
    STAR_API_TEST_UPDATER_LOG: updaterLog,
    STAR_API_TEST_UPDATE_EXIT: "7",
  },
});
assert.equal(failure.status, 7, failure.stderr || failure.stdout);
assert.equal(JSON.parse(readFileSync(join(state, "status.json"), "utf8")).conclusion, "failure");
assert.equal(existsSync(join(state, "processing")), false);

mkdirSync(join(state, "inbox", "request"));
writeFileSync(join(state, "inbox", "request", "request.json"), "not-json\n");
const malformed = spawnSync("bash", [worker], {
  encoding: "utf8",
  env: {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    STAR_API_PROJECT_DIR: project,
    STAR_API_UPDATE_STATE_DIR: state,
    STAR_API_TEST_UPDATER_LOG: updaterLog,
  },
});
assert.equal(malformed.status, 2, malformed.stderr || malformed.stdout);
assert.equal(JSON.parse(readFileSync(join(state, "status.json"), "utf8")).conclusion, "failure");
assert.equal(existsSync(join(state, "processing")), false);

symlinkSync(project, join(state, "inbox", "request"), "dir");
const unsafeRequest = spawnSync("bash", [worker], {
  encoding: "utf8",
  env: {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    STAR_API_PROJECT_DIR: project,
    STAR_API_UPDATE_STATE_DIR: state,
    STAR_API_TEST_UPDATER_LOG: updaterLog,
  },
});
assert.equal(unsafeRequest.status, 2, unsafeRequest.stderr || unsafeRequest.stdout);
assert.equal(existsSync(join(state, "processing")), false);
assert.equal(existsSync(project), true, "Rejecting a request symlink must not remove its target");

request("33333333-3333-4333-8333-333333333333", "0.1.17");
const retry = spawnSync("bash", [worker], {
  encoding: "utf8",
  env: {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    STAR_API_PROJECT_DIR: project,
    STAR_API_UPDATE_STATE_DIR: state,
    STAR_API_TEST_UPDATER_LOG: updaterLog,
  },
});
assert.equal(retry.status, 0, retry.stderr || retry.stdout);
assert.equal(JSON.parse(readFileSync(join(state, "status.json"), "utf8")).conclusion, "success");
console.log("Validated host-local update worker success and failure states.");
