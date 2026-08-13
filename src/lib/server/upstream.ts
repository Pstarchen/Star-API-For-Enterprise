import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { mergeUpstreamQuery, upstreamHealthTarget } from "@/lib/upstream-url";

type UpstreamKind = "PUBLIC_API" | "SERVER_LOCAL" | "TUNNEL";
const redirectStatuses = new Set([301, 302, 303, 307, 308]);

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

export function rewriteUpstreamPath(relativePath: string, mode: "PASSTHROUGH" | "PREFIX" | "EXACT", upstreamPrefix: string) {
  if (mode === "EXACT") return "";
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

function upstreamFetchError(error: unknown) {
  if (!(error instanceof Error)) return new Error("上游请求失败");
  if (["AbortError", "TimeoutError"].includes(error.name)) return new Error("上游连接超时");
  const cause = (error as Error & { cause?: unknown }).cause;
  const code = cause && typeof cause === "object" && "code" in cause && typeof cause.code === "string" ? cause.code : "";
  if (["ENOTFOUND", "EAI_AGAIN"].includes(code)) return new Error("上游域名解析失败");
  if (["UND_ERR_CONNECT_TIMEOUT", "ETIMEDOUT"].includes(code)) return new Error("上游连接超时");
  if (code === "ECONNREFUSED") return new Error("上游拒绝连接");
  if (["ECONNRESET", "UND_ERR_SOCKET"].includes(code)) return new Error("上游连接被中断");
  if (code === "CERT_HAS_EXPIRED") return new Error("上游 TLS 证书已过期");
  if (["DEPTH_ZERO_SELF_SIGNED_CERT", "SELF_SIGNED_CERT_IN_CHAIN", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "ERR_TLS_CERT_ALTNAME_INVALID"].includes(code)) return new Error("上游 TLS 证书校验失败");
  return new Error(code ? `上游请求失败（${code}）` : "上游请求失败");
}

async function fetchWithSafeRedirects(input: {
  target: URL;
  kind: UpstreamKind;
  method: string;
  headers?: HeadersInit;
  body?: BodyInit;
  signal: AbortSignal;
  sensitiveHeaders?: string[];
  maxRedirects?: number;
}) {
  let target = input.target;
  let method = input.method;
  let body = input.body;
  const headers = new Headers(input.headers);
  const sensitiveHeaders = new Set(["authorization", ...(input.sensitiveHeaders ?? []).map((value) => value.toLowerCase())]);
  const maxRedirects = input.maxRedirects ?? 5;

  for (let redirects = 0; ; redirects += 1) {
    await assertSafeUpstream(target.toString(), input.kind);
    let response: Response;
    try {
      response = await fetch(target, { method, headers, body, redirect: "manual", signal: input.signal, cache: "no-store" });
    } catch (error) {
      throw upstreamFetchError(error);
    }
    if (!redirectStatuses.has(response.status)) return response;

    const location = response.headers.get("location");
    if (!location) return response;
    if (redirects >= maxRedirects) {
      if (response.body) await response.body.cancel().catch(() => undefined);
      throw new Error(`上游重定向次数超过 ${maxRedirects} 次`);
    }

    const nextTarget = new URL(location, target);
    if (target.protocol === "https:" && nextTarget.protocol === "http:") {
      if (response.body) await response.body.cancel().catch(() => undefined);
      throw new Error("上游重定向不允许从 HTTPS 降级到 HTTP");
    }
    if (nextTarget.origin !== target.origin) for (const header of sensitiveHeaders) headers.delete(header);
    if ((response.status === 303 && method !== "HEAD") || ([301, 302].includes(response.status) && method === "POST")) {
      method = "GET";
      body = undefined;
      headers.delete("content-type");
    }
    if (response.body) await response.body.cancel().catch(() => undefined);
    target = nextTarget;
  }
}

export async function checkUpstreamHealth(input: { baseUrl: string; healthPath: string; timeoutMs: number; kind: UpstreamKind }) {
  const base = await assertSafeUpstream(input.baseUrl, input.kind);
  const target = upstreamHealthTarget(base.toString(), input.healthPath);
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetchWithSafeRedirects({ target, kind: input.kind, method: "GET", signal: AbortSignal.timeout(Math.min(input.timeoutMs, 10000)) });
      if (!response.ok) throw new Error(`上游健康检查返回 HTTP ${response.status}`);
      if (response.body) await response.body.cancel().catch(() => undefined);
      return response.status;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("上游健康检查返回 HTTP ")) throw error;
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
  const target = input.relativePath === ""
    ? new URL(base)
    : new URL(input.relativePath.replace(/^\/+/, ""), `${base.toString().replace(/\/+$/, "")}/`);
  mergeUpstreamQuery(target, input.query);
  const headers = new Headers({ Accept: "*/*", "User-Agent": "Star-API-Gateway/1.0", "X-Star-Request-Id": input.requestId });
  if (input.contentType) headers.set("Content-Type", input.contentType);
  if (input.authType === "BEARER" && typeof input.secrets.token === "string") headers.set("Authorization", `Bearer ${input.secrets.token}`);
  if (input.authType === "HEADER" && typeof input.secrets.headerName === "string" && typeof input.secrets.headerValue === "string") headers.set(input.secrets.headerName, input.secrets.headerValue);
  const response = await fetchWithSafeRedirects({
    target,
    kind: input.kind,
    method: input.method,
    headers,
    body: ["GET", "HEAD"].includes(input.method) || !input.body ? undefined : new Blob([input.body.buffer as ArrayBuffer]),
    signal: AbortSignal.timeout(input.timeoutMs),
    sensitiveHeaders: input.authType === "HEADER" && typeof input.secrets.headerName === "string" ? [input.secrets.headerName] : [],
  });
  return { response, body: new Uint8Array(await response.arrayBuffer()) };
}
