import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type LocalSystemUpdateRun = {
  id: string;
  provider: "local";
  status: string;
  conclusion: string | null;
  htmlUrl: null;
  createdAt: string;
  updatedAt: string;
};

type LocalUpdateRequest = {
  id: string;
  version: string;
  requestedAt: string;
};

export function isStableVersion(version: string) {
  return /^\d+\.\d+\.\d+$/.test(version);
}

function localUpdateDir() {
  return process.env.STAR_API_LOCAL_UPDATE_DIR?.trim() || "";
}

function localUpdateInbox(directory: string) {
  return join(directory, "inbox");
}

async function pathExists(path: string) {
  return await access(path).then(() => true).catch(() => false);
}

export async function localUpdatesEnabled() {
  const directory = localUpdateDir();
  if (!directory) return false;
  return await Promise.all([
    access(join(directory, "enabled"), constants.R_OK),
    access(localUpdateInbox(directory), constants.W_OK),
  ]).then(() => true).catch(() => false);
}

async function readJson(path: string): Promise<unknown> {
  return await readFile(path, "utf8").then((value) => JSON.parse(value) as unknown).catch(() => null);
}

function parseLocalRequest(value: unknown): LocalUpdateRequest | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string" || !item.id || typeof item.version !== "string" || !isStableVersion(item.version) || typeof item.requestedAt !== "string") return null;
  return { id: item.id, version: item.version, requestedAt: item.requestedAt };
}

function requestRun(request: LocalUpdateRequest, status: "queued" | "in_progress"): LocalSystemUpdateRun {
  return {
    id: request.id,
    provider: "local",
    status,
    conclusion: null,
    htmlUrl: null,
    createdAt: request.requestedAt,
    updatedAt: request.requestedAt,
  };
}

function parseLocalStatus(value: unknown): LocalSystemUpdateRun | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string" || !item.id || typeof item.status !== "string" || typeof item.createdAt !== "string" || typeof item.updatedAt !== "string") return null;
  return {
    id: item.id,
    provider: "local",
    status: item.status,
    conclusion: typeof item.conclusion === "string" ? item.conclusion : null,
    htmlUrl: null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export async function localUpdateRun() {
  const directory = localUpdateDir();
  if (!directory) return null;
  const processing = parseLocalRequest(await readJson(join(directory, "processing", "request.json")));
  if (processing) return requestRun(processing, "in_progress");
  const queued = parseLocalRequest(await readJson(join(localUpdateInbox(directory), "request", "request.json")));
  if (queued) return requestRun(queued, "queued");
  return parseLocalStatus(await readJson(join(directory, "status.json")));
}

export async function queueLocalUpdate(version: string) {
  const directory = localUpdateDir();
  if (!directory || !await localUpdatesEnabled()) throw new Error("UPDATE_DISABLED");
  const inbox = localUpdateInbox(directory);
  if (await pathExists(join(inbox, "request")) || await pathExists(join(directory, "processing"))) throw new Error("UPDATE_IN_PROGRESS");

  const request: LocalUpdateRequest = { id: randomUUID(), version, requestedAt: new Date().toISOString() };
  const temporary = join(inbox, `.request-${request.id}`);
  await mkdir(temporary, { mode: 0o700 });
  try {
    await writeFile(join(temporary, "request.json"), `${JSON.stringify(request)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, join(inbox, "request"));
  } catch (error) {
    await rm(temporary, { recursive: true, force: true }).catch(() => undefined);
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "EEXIST" || code === "ENOTEMPTY") throw new Error("UPDATE_IN_PROGRESS");
    throw error;
  }
}
