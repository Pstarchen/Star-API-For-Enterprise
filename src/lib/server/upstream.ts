import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

type UpstreamKind = "PUBLIC_API" | "SERVER_LOCAL" | "TUNNEL";

function privateAddress(address: string) {
  const normalized = address.toLowerCase();
  if (normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:")) return true;
  if (isIP(address) !== 4) return false;
  const [a, b] = address.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function allowedLocalHosts() {
  return new Set((process.env.LOCAL_UPSTREAM_HOSTS ?? "host.docker.internal").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean));
}

export async function assertSafeUpstream(value: string, kind: UpstreamKind) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("INVALID_UPSTREAM_URL");
  const hostname = url.hostname.toLowerCase();
  if (kind === "SERVER_LOCAL") {
    if (["localhost", "127.0.0.1", "::1"].includes(hostname)) throw new Error("CONTAINER_LOOPBACK_BLOCKED");
    if (!allowedLocalHosts().has(hostname)) throw new Error("LOCAL_UPSTREAM_NOT_ALLOWED");
    return url;
  }
  const addresses = await lookup(hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => privateAddress(address))) throw new Error("PRIVATE_UPSTREAM_BLOCKED");
  return url;
}

export function rewriteUpstreamPath(relativePath: string, mode: "PASSTHROUGH" | "PREFIX", upstreamPrefix: string) {
  if (mode === "PASSTHROUGH") return relativePath;
  const prefix = `/${upstreamPrefix}`.replace(/\/{2,}/g, "/").replace(/\/$/, "");
  const suffix = relativePath === "/" ? "" : `/${relativePath}`.replace(/\/{2,}/g, "/");
  return `${prefix}${suffix}` || "/";
}

export function chooseUpstreamNode<T extends { weight: number }>(nodes: T[]) {
  if (!nodes.length) throw new Error("UPSTREAM_NOT_CONFIGURED");
  const total = nodes.reduce((sum, node) => sum + Math.max(1, node.weight), 0);
  let cursor = Math.random() * total;
  for (const node of nodes) {
    cursor -= Math.max(1, node.weight);
    if (cursor <= 0) return node;
  }
  return nodes[nodes.length - 1];
}

export async function checkUpstreamHealth(input: { baseUrl: string; healthPath: string; timeoutMs: number; kind: UpstreamKind }) {
  const base = await assertSafeUpstream(input.baseUrl, input.kind);
  const target = new URL(input.healthPath.replace(/^\/+/, ""), `${base.toString().replace(/\/+$/, "")}/`);
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(target, { method: "GET", redirect: "error", signal: AbortSignal.timeout(Math.min(input.timeoutMs, 10000)), cache: "no-store" });
      if (!response.ok) throw new Error(`HEALTH_STATUS_${response.status}`);
      return response.status;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("HEALTH_STATUS_")) throw error;
      lastError = error;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw lastError;
}

export async function forwardRequest(input: {
  baseUrl: string;
  relativePath: string;
  method: string;
  query: string;
  body: Uint8Array | null;
  contentType: string | null;
  timeoutMs: number;
  authType: string | null;
  secrets: Record<string, unknown>;
  kind: UpstreamKind;
  requestId: string;
}) {
  const base = await assertSafeUpstream(input.baseUrl, input.kind);
  const target = new URL(input.relativePath.replace(/^\/+/, ""), `${base.toString().replace(/\/+$/, "")}/`);
  target.search = input.query;
  const headers = new Headers({ Accept: "*/*", "User-Agent": "Star-API-Gateway/1.0", "X-Star-Request-Id": input.requestId });
  if (input.contentType) headers.set("Content-Type", input.contentType);
  if (input.authType === "BEARER" && typeof input.secrets.token === "string") headers.set("Authorization", `Bearer ${input.secrets.token}`);
  if (input.authType === "HEADER" && typeof input.secrets.headerName === "string" && typeof input.secrets.headerValue === "string") headers.set(input.secrets.headerName, input.secrets.headerValue);
  const response = await fetch(target, {
    method: input.method,
    headers,
    body: ["GET", "HEAD"].includes(input.method) || !input.body ? undefined : new Blob([input.body.buffer as ArrayBuffer]),
    redirect: "error",
    signal: AbortSignal.timeout(input.timeoutMs),
    cache: "no-store",
  });
  return { response, body: new Uint8Array(await response.arrayBuffer()) };
}
