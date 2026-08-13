import "server-only";

import { readFile } from "node:fs/promises";

const GHCR_APP_IMAGE = "ghcr.io/pstarchen/star-api-app";
const GITHUB_API = "https://api.github.com";

export type SystemUpdateStatus = {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  updateEnabled: boolean;
  updateProvider: "github-actions" | "disabled";
  lastRun: {
    id: number;
    status: string;
    conclusion: string | null;
    htmlUrl: string;
    createdAt: string;
    updatedAt: string;
  } | null;
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

async function latestStableVersion() {
  const image = process.env.STAR_API_APP_IMAGE?.trim() || GHCR_APP_IMAGE;
  if (!image.startsWith("ghcr.io/")) return null;
  const repository = image.slice("ghcr.io/".length);
  const tokenResponse = await fetch(`https://ghcr.io/token?scope=repository:${repository}:pull`, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
  if (!tokenResponse.ok) return null;
  const tokenData = await tokenResponse.json().catch(() => null) as { token?: string; access_token?: string } | null;
  const token = tokenData?.token || tokenData?.access_token;
  if (!token) return null;
  const tagsResponse = await fetch(`https://ghcr.io/v2/${repository}/tags/list`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!tagsResponse.ok) return null;
  const tagsData = await tagsResponse.json().catch(() => null) as { tags?: string[] } | null;
  const versions = (tagsData?.tags ?? []).filter((tag) => /^\d+\.\d+\.\d+$/.test(tag)).sort(compareVersions);
  return versions.at(-1) ?? null;
}

async function lastDeployRun() {
  const token = await githubToken();
  if (!token) return null;
  const repository = githubRepository();
  const workflow = encodeURIComponent(githubWorkflow());
  const data = await githubRequest<{ workflow_runs?: Array<{ id: number; status: string; conclusion: string | null; html_url: string; created_at: string; updated_at: string }> }>(`/repos/${repository}/actions/workflows/${workflow}/runs?per_page=1`);
  const run = data.workflow_runs?.[0];
  if (!run) return null;
  return { id: run.id, status: run.status, conclusion: run.conclusion, htmlUrl: run.html_url, createdAt: run.created_at, updatedAt: run.updated_at };
}

export async function getSystemUpdateStatus(): Promise<SystemUpdateStatus> {
  const current = currentVersion();
  const [latestVersion, lastRun] = await Promise.all([latestStableVersion().catch(() => null), lastDeployRun().catch(() => null)]);
  const updateEnabled = Boolean(await githubToken());
  return {
    currentVersion: current,
    latestVersion,
    updateAvailable: Boolean(latestVersion && compareVersions(latestVersion, current) > 0),
    updateEnabled,
    updateProvider: updateEnabled ? "github-actions" : "disabled",
    lastRun,
  };
}

export async function triggerSystemUpdate(version: string) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("INVALID_VERSION");
  const token = await githubToken();
  if (!token) throw new Error("UPDATE_DISABLED");
  const repository = githubRepository();
  const workflow = encodeURIComponent(githubWorkflow());
  await githubRequest(`/repos/${repository}/actions/workflows/${workflow}/dispatches`, {
    method: "POST",
    body: JSON.stringify({ ref: process.env.STAR_API_GITHUB_DEPLOY_REF || "main", inputs: { version, confirmation: "DEPLOY" } }),
  });
}
