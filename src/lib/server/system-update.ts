import "server-only";

import { readFile } from "node:fs/promises";
import { isStableVersion, localUpdateRun, localUpdatesEnabled, queueLocalUpdate } from "./system-update-state";

const GHCR_APP_IMAGE = "ghcr.io/pstarchen/star-api-app";
const GITHUB_API = "https://api.github.com";

export type SystemUpdateRun = {
  id: string;
  provider: "local" | "github-actions";
  status: string;
  conclusion: string | null;
  htmlUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SystemUpdateStatus = {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  updateEnabled: boolean;
  updateProvider: "local" | "github-actions" | "disabled";
  updateSource: "custom-feed" | "configured-version" | "ghcr" | "unavailable";
  lastRun: SystemUpdateRun | null;
};

function currentVersion() {
  return process.env.APP_VERSION || process.env.STAR_API_VERSION || "0.1.0";
}

function compareVersions(left: string, right: string) {
  const leftParts = left.split(".").map((part) => Number(part));
  const rightParts = right.split(".").map((part) => Number(part));
  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (difference) return difference;
  }
  return 0;
}

async function githubToken() {
  const file = process.env.STAR_API_GITHUB_TOKEN_FILE;
  if (file) return await readFile(file, "utf8").then((value) => value.trim()).catch(() => "");
  return process.env.STAR_API_GITHUB_TOKEN?.trim() || "";
}

function githubRepository() {
  return process.env.STAR_API_GITHUB_REPOSITORY?.trim() || "Pstarchen/Star-API-For-Enterprise";
}

function githubWorkflow() {
  return process.env.STAR_API_GITHUB_DEPLOY_WORKFLOW?.trim() || "deploy-production.yml";
}

async function githubRequest<T>(path: string, init: RequestInit = {}) {
  const token = await githubToken();
  const response = await fetch(`${GITHUB_API}${path}`, {
    ...init,
    signal: AbortSignal.timeout(10_000),
    headers: {
      "Accept": "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "Star-API-System-Updater",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`GITHUB_${response.status}`);
  if (response.status === 204) return null as T;
  return await response.json() as T;
}

async function latestStableVersion(): Promise<{ version: string | null; source: SystemUpdateStatus["updateSource"] }> {
  const configured = process.env.STAR_API_UPDATE_LATEST_VERSION?.trim();
  if (configured && isStableVersion(configured)) return { version: configured, source: "configured-version" };

  const feedUrl = process.env.STAR_API_UPDATE_FEED_URL?.trim();
  if (feedUrl) {
    const response = await fetch(feedUrl, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return { version: null, source: "custom-feed" };
    const data = await response.json().catch(() => null) as { latestVersion?: unknown; version?: unknown } | null;
    const version = typeof data?.latestVersion === "string" ? data.latestVersion : typeof data?.version === "string" ? data.version : null;
    return { version: version && isStableVersion(version) ? version : null, source: "custom-feed" };
  }

  const image = process.env.STAR_API_APP_IMAGE?.trim() || GHCR_APP_IMAGE;
  if (!image.startsWith("ghcr.io/")) return { version: null, source: "unavailable" };
  const repository = image.slice("ghcr.io/".length);
  const tokenResponse = await fetch(`https://ghcr.io/token?scope=repository:${repository}:pull`, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
  if (!tokenResponse.ok) return { version: null, source: "ghcr" };
  const tokenData = await tokenResponse.json().catch(() => null) as { token?: string; access_token?: string } | null;
  const token = tokenData?.token || tokenData?.access_token;
  if (!token) return { version: null, source: "ghcr" };
  const tagsResponse = await fetch(`https://ghcr.io/v2/${repository}/tags/list`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!tagsResponse.ok) return { version: null, source: "ghcr" };
  const tagsData = await tagsResponse.json().catch(() => null) as { tags?: string[] } | null;
  const versions = (tagsData?.tags ?? []).filter(isStableVersion).sort(compareVersions);
  return { version: versions.at(-1) ?? null, source: "ghcr" };
}

async function lastDeployRun(): Promise<SystemUpdateRun | null> {
  const token = await githubToken();
  if (!token) return null;
  const repository = githubRepository();
  const workflow = encodeURIComponent(githubWorkflow());
  const data = await githubRequest<{ workflow_runs?: Array<{ id: number; status: string; conclusion: string | null; html_url: string; created_at: string; updated_at: string }> }>(`/repos/${repository}/actions/workflows/${workflow}/runs?per_page=1`);
  const run = data.workflow_runs?.[0];
  if (!run) return null;
  return { id: String(run.id), provider: "github-actions", status: run.status, conclusion: run.conclusion, htmlUrl: run.html_url, createdAt: run.created_at, updatedAt: run.updated_at };
}

export async function getSystemUpdateStatus(): Promise<SystemUpdateStatus> {
  const current = currentVersion();
  const [latest, localEnabled, token] = await Promise.all([latestStableVersion().catch(() => ({ version: null, source: "unavailable" as const })), localUpdatesEnabled(), githubToken()]);
  const updateProvider = localEnabled ? "local" : token ? "github-actions" : "disabled";
  const lastRun = updateProvider === "local" ? await localUpdateRun() : updateProvider === "github-actions" ? await lastDeployRun().catch(() => null) : null;
  return {
    currentVersion: current,
    latestVersion: latest.version,
    updateAvailable: Boolean(latest.version && compareVersions(latest.version, current) > 0),
    updateEnabled: updateProvider !== "disabled",
    updateProvider,
    updateSource: latest.source,
    lastRun,
  };
}

export async function triggerSystemUpdate(version: string) {
  if (!isStableVersion(version)) throw new Error("INVALID_VERSION");
  if (await localUpdatesEnabled()) {
    await queueLocalUpdate(version);
    return;
  }

  const token = await githubToken();
  if (!token) throw new Error("UPDATE_DISABLED");
  const repository = githubRepository();
  const workflow = encodeURIComponent(githubWorkflow());
  await githubRequest(`/repos/${repository}/actions/workflows/${workflow}/dispatches`, {
    method: "POST",
    body: JSON.stringify({ ref: process.env.STAR_API_GITHUB_DEPLOY_REF || "main", inputs: { version, confirmation: "DEPLOY" } }),
  });
}
