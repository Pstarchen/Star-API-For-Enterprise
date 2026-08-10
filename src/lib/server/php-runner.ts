import "server-only";

import { prisma } from "@/lib/server/prisma";

type RunnerResult = { status?: number; headers?: Record<string, string>; body?: string; message?: string; runtimeError?: string | null };

export async function executePhpPackage(input: { productId: string; entryFile: string; request: Request; relativePath: string; body: Uint8Array | null; timeoutMs: number }) {
  const [assets, runnerUrl, runnerSecret] = await Promise.all([
    prisma.apiAsset.findMany({ where: { productId: input.productId, kind: "PHP_SOURCE" }, select: { name: true, data: true }, orderBy: { name: "asc" } }),
    Promise.resolve(process.env.PHP_RUNNER_URL),
    Promise.resolve(process.env.PHP_RUNNER_SECRET),
  ]);
  if (!assets.length) throw new Error("PHP_PACKAGE_NOT_DEPLOYED");
  if (!runnerUrl || !runnerSecret || runnerSecret.length < 32) throw new Error("PHP_RUNTIME_UNAVAILABLE");
  const headers: Record<string, string> = {};
  input.request.headers.forEach((value, name) => {
    if (!["authorization", "x-api-key", "cookie", "host", "content-length", "connection"].includes(name.toLowerCase())) headers[name.toLowerCase()] = value.slice(0, 8192);
  });
  let response: Response;
  try {
    response = await fetch(runnerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Runner-Secret": runnerSecret },
      body: JSON.stringify({
        entryFile: input.entryFile,
        files: assets.map((asset) => ({ path: asset.name, data: Buffer.from(asset.data).toString("base64") })),
        request: { method: input.request.method, path: input.relativePath, query: new URL(input.request.url).searchParams.toString(), headers, body: input.body ? Buffer.from(input.body).toString("base64") : "" },
      }),
      signal: AbortSignal.timeout(Math.min(Math.max(input.timeoutMs + 3000, 5000), 65000)),
      cache: "no-store",
    });
  } catch { throw new Error("PHP_RUNTIME_UNAVAILABLE"); }
  const result = await response.json().catch(() => null) as RunnerResult | null;
  if (!response.ok || !result || typeof result.status !== "number" || typeof result.body !== "string") throw new Error(response.status === 504 ? "PHP_RUNTIME_TIMEOUT" : "PHP_RUNTIME_UNAVAILABLE");
  const body = Buffer.from(result.body, "base64");
  if (body.byteLength > 8 * 1024 * 1024) throw new Error("PHP_RESPONSE_TOO_LARGE");
  const responseHeaders = new Headers();
  for (const [name, value] of Object.entries(result.headers ?? {})) {
    const lower = name.toLowerCase();
    if (["content-type", "content-disposition", "cache-control"].includes(lower) || (lower.startsWith("x-") && !lower.startsWith("x-star-"))) responseHeaders.set(name, value.slice(0, 8192));
  }
  if (!responseHeaders.has("Content-Type")) responseHeaders.set("Content-Type", "text/html; charset=utf-8");
  return { response: new Response(body, { status: result.status, headers: responseHeaders }), responseBytes: body.byteLength, runtimeError: result.runtimeError ?? null };
}
