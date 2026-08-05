import "server-only";

import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

function privateAddress(address: string) {
  if (address === "::1" || address.startsWith("fc") || address.startsWith("fd") || address.startsWith("fe80:")) return true;
  if (isIP(address) !== 4) return false;
  const [a, b] = address.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export async function assertSafeUpstream(value: string, allowPrivateNetwork = false) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error("INVALID_UPSTREAM_URL");
  if (!allowPrivateNetwork) {
    const addresses = await lookup(url.hostname, { all: true });
    if (!addresses.length || addresses.some(({ address }) => privateAddress(address))) throw new Error("PRIVATE_UPSTREAM_BLOCKED");
  }
  return url;
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
  allowPrivateNetwork: boolean;
  requestId: string;
}) {
  const base = await assertSafeUpstream(input.baseUrl, input.allowPrivateNetwork);
  const target = new URL(input.relativePath.replace(/^\/+/, ""), `${base.toString().replace(/\/+$/, "")}/`);
  target.search = input.query;
  const headers = new Headers({ Accept: "application/json", "User-Agent": "Star-API-Gateway/1.0", "X-Star-Request-Id": input.requestId });
  if (input.contentType) headers.set("Content-Type", input.contentType);
  if (input.authType === "BEARER" && typeof input.secrets.token === "string") headers.set("Authorization", `Bearer ${input.secrets.token}`);
  if (input.authType === "HEADER" && typeof input.secrets.headerName === "string" && typeof input.secrets.headerValue === "string") {
    headers.set(input.secrets.headerName, input.secrets.headerValue);
  }
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
