import { Prisma } from "@prisma/client";
import { authenticateApiKey } from "@/lib/server/api-key";
import { decryptJson } from "@/lib/server/encryption";
import { executeInternalHandler } from "@/lib/server/internal-handlers";
import { prisma } from "@/lib/server/prisma";
import { consumeRateLimit } from "@/lib/server/redis";
import { forwardRequest } from "@/lib/server/upstream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 1024 * 1024;

function jsonError(status: number, code: string, message: string, requestId: string, headers: HeadersInit = {}) {
  return Response.json({ code, message, requestId }, { status, headers: { "Cache-Control": "no-store", "X-Star-Request-Id": requestId, ...headers } });
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) return authorization.slice(7).trim();
  return request.headers.get("x-api-key")?.trim() ?? "";
}

function monthStart() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

async function handle(request: Request, context: RouteContext<"/api/v1/gateway/[slug]/[[...path]]">) {
  const startedAt = Date.now();
  const requestId = `req_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`;
  const { slug, path = [] } = await context.params;
  const relativePath = `/${path.join("/")}`;
  const method = request.method.toUpperCase();

  const product = await prisma.apiProduct.findFirst({
    where: { slug, status: "PUBLISHED" },
    include: { versions: { orderBy: { version: "desc" }, take: 1, include: { endpoints: true } } },
  });
  if (!product) return jsonError(404, "API_NOT_FOUND", "接口不存在或尚未发布", requestId);
  const endpoint = product.versions[0]?.endpoints.find((item) => item.method === method && item.path.replace(/\/+$/, "") === relativePath.replace(/\/+$/, ""));
  if (!endpoint) return jsonError(404, "ENDPOINT_NOT_FOUND", "请求方法或路径不存在", requestId);

  const apiKey = await authenticateApiKey(bearerToken(request));
  if (!apiKey) return jsonError(401, "INVALID_API_KEY", "API Key 无效、过期或已撤销", requestId);
  if (apiKey.scopes.length && !apiKey.scopes.some((scope) => scope === "*" || scope === product.slug || scope === `api:${product.slug}`)) {
    return jsonError(403, "SCOPE_DENIED", "API Key 未获得该接口的访问范围", requestId);
  }

  const subscription = await prisma.subscription.findUnique({ where: { appId_productId: { appId: apiKey.appId, productId: product.id } } });
  if (!subscription || subscription.status !== "ACTIVE") {
    return jsonError(403, "SUBSCRIPTION_REQUIRED", "应用尚未订阅该接口", requestId);
  }

  const usedThisMonth = await prisma.requestLog.count({ where: { appId: apiKey.appId, productId: product.id, occurredAt: { gte: monthStart() } } });
  if (subscription.quotaMonthly > BigInt(0) && BigInt(usedThisMonth) >= subscription.quotaMonthly) {
    return jsonError(429, "MONTHLY_QUOTA_EXCEEDED", "本月调用配额已用尽", requestId);
  }

  try {
    const limit = await consumeRateLimit(`starapi:qps:${subscription.id}:${Math.floor(Date.now() / 1000)}`, subscription.qpsLimit);
    if (!limit.allowed) return jsonError(429, "RATE_LIMITED", "请求频率超过订阅 QPS 限制", requestId, { "X-RateLimit-Remaining": "0" });
  } catch {
    return jsonError(503, "RATE_LIMIT_UNAVAILABLE", "实时限流服务暂不可用", requestId);
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) return jsonError(413, "PAYLOAD_TOO_LARGE", "请求体不能超过 1 MB", requestId);
  const body = ["GET", "HEAD"].includes(method) ? null : new Uint8Array(await request.arrayBuffer());
  if (body && body.byteLength > MAX_BODY_BYTES) return jsonError(413, "PAYLOAD_TOO_LARGE", "请求体不能超过 1 MB", requestId);

  let statusCode = 500;
  let responseBytes = 0;
  let errorCode: string | null = null;
  let response: Response;
  try {
    if (product.executionMode === "INTERNAL") {
      const contentType = request.headers.get("content-type") ?? "";
      let parsedBody: unknown = null;
      if (body?.byteLength) {
        const text = new TextDecoder().decode(body);
        parsedBody = contentType.includes("application/json") ? JSON.parse(text) : { value: text, text };
      }
      const result = executeInternalHandler(product.internalHandler, { body: parsedBody, query: new URL(request.url).searchParams });
      statusCode = result.status;
      const payload = JSON.stringify({ code: statusCode, message: statusCode < 400 ? "ok" : "request failed", requestId, data: result.data });
      responseBytes = Buffer.byteLength(payload);
      response = new Response(payload, { status: statusCode, headers: { "Content-Type": "application/json; charset=utf-8" } });
    } else {
      if (!product.upstreamBaseUrl) throw new Error("UPSTREAM_NOT_CONFIGURED");
      const config = product.executionConfig && typeof product.executionConfig === "object" && !Array.isArray(product.executionConfig) ? product.executionConfig as Record<string, unknown> : {};
      const upstream = await forwardRequest({
        baseUrl: product.upstreamBaseUrl,
        relativePath,
        method,
        query: new URL(request.url).search,
        body,
        contentType: request.headers.get("content-type"),
        timeoutMs: product.timeoutMs,
        authType: product.upstreamAuthType,
        secrets: decryptJson(product.secretConfigEncrypted),
        allowPrivateNetwork: config.allowPrivateNetwork === true,
        requestId,
      });
      statusCode = upstream.response.status;
      responseBytes = upstream.body.byteLength;
      response = new Response(upstream.body, { status: statusCode, headers: { "Content-Type": upstream.response.headers.get("content-type") ?? "application/octet-stream" } });
    }
  } catch (error) {
    const timeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    errorCode = timeout ? "UPSTREAM_TIMEOUT" : "EXECUTION_FAILED";
    statusCode = timeout ? 504 : 502;
    response = jsonError(statusCode, errorCode, timeout ? "上游接口响应超时" : "接口执行失败", requestId);
  }

  const success = statusCode >= 200 && statusCode < 400;
  const billableUnits = success ? BigInt(1) : BigInt(0);
  const successfulUsage = success ? await prisma.requestLog.count({ where: { appId: apiKey.appId, productId: product.id, occurredAt: { gte: monthStart() }, statusCode: { gte: 200, lt: 400 } } }) : 0;
  const isChargeable = success && product.billingMode === "PER_REQUEST" && BigInt(successfulUsage) >= product.freeQuotaMonthly;
  const amount = isChargeable ? subscription.unitPrice : new Prisma.Decimal(0);

  await prisma.requestLog.create({
    data: {
      id: requestId,
      appId: apiKey.appId,
      apiKeyId: apiKey.id,
      productId: product.id,
      endpointId: endpoint.id,
      method,
      path: relativePath,
      statusCode,
      latencyMs: Date.now() - startedAt,
      region: request.headers.get("x-star-region")?.slice(0, 48) || "default",
      billableUnits,
      amount,
      responseBytes,
      errorCode,
      billed: isChargeable,
    },
  });

  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Star-Request-Id", requestId);
  response.headers.set("X-Billable-Units", billableUnits.toString());
  response.headers.set("X-Request-Cost", amount.toString());
  return response;
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
