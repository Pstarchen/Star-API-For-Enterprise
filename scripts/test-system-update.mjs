import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = await mkdtemp(join(tmpdir(), "star-api-system-update-"));
const stateDir = join(root, "state");
await mkdir(stateDir);
await mkdir(join(stateDir, "inbox"));
await writeFile(join(stateDir, "enabled"), "");

process.env.APP_VERSION = "0.1.14";
process.env.STAR_API_LOCAL_UPDATE_DIR = stateDir;

try {
  const { isStableVersion, localUpdateRun, localUpdatesEnabled, queueLocalUpdate } = await import("../src/lib/server/system-update-state.ts");
  assert.equal(isStableVersion("0.1.15"), true);
  assert.equal(isStableVersion("latest"), false);
  assert.equal(await localUpdatesEnabled(), true);

  await queueLocalUpdate("0.1.15");
  const request = JSON.parse(await readFile(join(stateDir, "inbox", "request", "request.json"), "utf8"));
  assert.equal(request.version, "0.1.15");
  assert.match(request.id, /^[0-9a-f-]{36}$/);

  const queued = await localUpdateRun();
  assert.equal(queued?.id, request.id);
  assert.equal(queued?.status, "queued");
  await assert.rejects(() => queueLocalUpdate("0.1.15"), /UPDATE_IN_PROGRESS/);

  await rename(join(stateDir, "inbox", "request"), join(stateDir, "processing"));
  const processing = await localUpdateRun();
  assert.equal(processing?.status, "in_progress");

  await rm(join(stateDir, "processing"), { recursive: true });
  await writeFile(join(stateDir, "status.json"), `${JSON.stringify({
    id: request.id,
    version: request.version,
    status: "completed",
    conclusion: "success",
    createdAt: request.requestedAt,
    updatedAt: new Date().toISOString(),
  })}\n`);
  const completed = await localUpdateRun();
  assert.equal(completed?.status, "completed");
  assert.equal(completed?.conclusion, "success");
  console.log("Validated host-local system update queue and status transitions.");
} finally {
  await rm(root, { recursive: true, force: true });
}
