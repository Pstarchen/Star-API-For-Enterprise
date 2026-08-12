import "server-only";

import { Prisma } from "@prisma/client";
import { routeStaticSegmentCount } from "@/lib/api-routes";
import { authenticateApiKey } from "@/lib/server/api-key";
import { contentResponse } from "@/lib/server/api-assets";
import { decryptJson } from "@/lib/server/encryption";
import { executeInternalHandler } from "@/lib/server/internal-handlers";
import { queueLowBalanceAlert, queueQuotaAlert } from "@/lib/server/email-delivery";
import { prisma } from "@/lib/server/prisma";
import { executePhpPackage } from "@/lib/server/php-runner";
import { consumeRateLimit } from "@/lib/server/redis";
import { reserveGatewayUsage } from "@/lib/server/gateway-usage";
import { chooseUpstreamNode, forwardRequest, rewriteUpstreamPath } from "@/lib/server/upstream";
import { lockTenantBalance } from "@/lib/server/wallet-ledger";
import { isContentHandler } from "@/lib/internal-handlers";

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

function monthPeriod() {
  const start = monthStart();
  return `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
}

function requestHost(request: Request) {
  const raw = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host") || new URL(request.url).host;
  return raw.replace(/:\d+$/, "").toLowerCase();
}

function clientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || "unknown";
}

function routeMatch(template: string, actual: string) {
  const expected = template.replace(/\/+$/, "") || "/";
  const received = actual.replace(/\/+$/, "") || "/";
  const expectedParts = expected.split("/").filter(Boolean);
  const actualParts = received.split("/").filter(Boolean);
  if (expectedParts.length !== actualParts.length) return null;
  const pathParams: Record<string, string> = {};
  for (let index = 0; index < expectedParts.length; index += 1) {
    const part = expectedParts[index];
    if (part.startsWith("{") && part.endsWith("}")) pathParams[part.slice(1, -1)] = decodeURIComponent(actualParts[index]);
    else if (part !== actualParts[index]) return null;
  }
  return pathParams;
}

function populatedPath(template: string, pathParams: Record<string, string>) {
  return template.replace(/\{([^/{}]+)\}/g, (_match, name: string) => encodeURIComponent(pathParams[name] ?? ""));
}

function upstreamRequestPath(productExecutionConfig: Prisma.JsonValue, endpointPath: string, publicPath: string, pathParams: Record<string, string>) {
  const config = productExecutionConfig && typeof productExecutionConfig === "object" && !Array.isArray(productExecutionConfig) ? productExecutionConfig as Record<string, unknown> : {};
  return config.sourceType === "OPENAPI_IMPORT" ? populatedPath(endpointPath, pathParams) : publicPath;
}

function validType(value: unknown, type: string) {
  if (type === "integer") return typeof value === "number" ? Number.isInteger(value) : /^-?\d+$/.test(String(value));
  if (type === "number") return !Number.isNaN(Number(value));
  if (type === "boolean") return typeof value === "boolean" || ["true", "false", "1", "0"].includes(String(value));
  if (type === "array") return Array.isArray(value);
  if (type === "object") return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  return typeof value === "string";
}

function typedParameterValue(value: string, type: string): unknown {
  if (type === "integer") return Number.parseInt(value, 10);
  if (type === "number") return Number(value);
  if (type === "boolean") return ["true", "1"].includes(value.toLowerCase());
  if (type === "array" || type === "object") {
    try { return JSON.parse(value); } catch { return value; }
  }
  return value;
}

function applyParameterDefaults(parameters: Array<{ location: "PATH" | "QUERY" | "BODY"; name: string; dataType: string; defaultValue: string | null }>, pathParams: Record<string, string>, query: URLSearchParams, body: unknown) {
  let bodyRecord = body && typeof body === "object" && !Array.isArray(body) ? { ...body as Record<string, unknown> } : null;
  for (const parameter of parameters) {
    if (parameter.defaultValue === null) continue;
    if (parameter.location === "PATH" && !(parameter.name in pathParams)) pathParams[parameter.name] = parameter.defaultValue;
    if (parameter.location === "QUERY" && !query.has(parameter.name)) query.set(parameter.name, parameter.defaultValue);
    if (parameter.location === "BODY") {
      bodyRecord ??= {};
      if (!(parameter.name in bodyRecord)) bodyRecord[parameter.name] = typedParameterValue(parameter.defaultValue, parameter.dataType);
    }
  }
  return bodyRecord ?? body;
}

function parameterError(parameters: Array<{ location: "PATH" | "QUERY" | "BODY"; name: string; required: boolean; dataType: string; validation: Prisma.JsonValue }>, pathParams: Record<string, string>, query: URLSearchParams, body: unknown) {
  for (const parameter of parameters) {
    const source = parameter.location === "PATH" ? pathParams : parameter.location === "QUERY" ? Object.fromEntries(query) : body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
    const value = source[parameter.name as keyof typeof source];
    if (parameter.required && (value === undefined || value === null || value === "")) return `缺少必填参数：${parameter.name}`;
    if (value !== undefined && value !== null && !validType(value, parameter.dataType)) return `参数 ${parameter.name} 的类型应为 ${parameter.dataType}`;
    const rules = parameter.validation && typeof parameter.validation === "object" && !Array.isArray(parameter.validation) ? parameter.validation as Record<string, unknown> : {};
    if (value !== undefined && typeof rules.pattern === "string" && !new RegExp(rules.pattern).test(String(value))) return `参数 ${parameter.name} 格式不正确`;
  }
  return null;
}

function corsHeaders(origin: string | null) {
  return { "Access-Control-Allow-Origin": origin || "*", "Access-Control-Allow-Headers": "Authorization, Content-Type, X-API-Key, X-API-Version", "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS", Vary: "Origin" };
}

function mappedUpstreamInput(parameters: Array<{ location: "PATH" | "QUERY" | "BODY"; name: string; upstreamName: string | null }>, query: URLSearchParams, parsedBody: unknown, originalBody: Uint8Array | null) {
  const upstreamQuery = new URLSearchParams(query);
  for (const parameter of parameters.filter((item) => item.location === "QUERY" && item.upstreamName && item.upstreamName !== item.name)) {
    const values = upstreamQuery.getAll(parameter.name);
    if (!values.length) continue;
    upstreamQuery.delete(parameter.name);
    for (const value of values) upstreamQuery.append(parameter.upstreamName!, value);
  }
  if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) return { query: upstreamQuery.toString(), body: originalBody };
  const mappedBody = { ...parsedBody as Record<string, unknown> };
  for (const parameter of parameters.filter((item) => item.location === "BODY" && item.upstreamName && item.upstreamName !== item.name)) {
    if (!(parameter.name in mappedBody)) continue;
    mappedBody[parameter.upstreamName!] = mappedBody[parameter.name];
    delete mappedBody[parameter.name];
  }
  return { query: upstreamQuery.toString(), body: new TextEncoder().encode(JSON.stringify(mappedBody)) };
}

function maskFields(value: unknown, fields: string[]) {
  if (!value || typeof value !== "object") return value;
  const clone = structuredClone(value) as Record<string, unknown>;
  for (const field of fields) {
    const parts = field.split(".").filter(Boolean);
    let cursor: unknown = clone;
    for (let index = 0; index < parts.length - 1; index += 1) cursor = cursor && typeof cursor === "object" ? (cursor as Record<string, unknown>)[parts[index]] : null;
    if (cursor && typeof cursor === "object" && parts.length) (cursor as Record<string, unknown>)[parts.at(-1)!] = "***";
  }
  return clone;
}

async function applyResponseRules(response: Response, fields: string[]) {
  if (!fields.length || !response.headers.get("content-type")?.includes("application/json")) return response;
  try {
    const data = await response.clone().json();
    const payload = JSON.stringify(maskFields(data, fields));
    const headers = new Headers(response.headers);
    headers.set("Content-Length", String(Buffer.byteLength(payload)));
    return new Response(payload, { status: response.status, statusText: response.statusText, headers });
  } catch { return response; }
}

export async function handlePublicGateway(request: Request, publicPath: string) {
  const startedAt = Date.now();
  const requestId = `req_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`;
  const url = new URL(request.url);
  const requestedMethod = request.method === "OPTIONS" ? request.headers.get("access-control-request-method")?.toUpperCase() || "GET" : request.method.toUpperCase();
  const routeVersion = request.headers.get("x-api-version")?.trim() || url.searchParams.get("api_version")?.trim() || "";
  const host = requestHost(request);
  const candidates = await prisma.endpoint.findMany({
    where: { publicHost: host, methods: { hasSome: [requestedMethod, "ALL"] }, version: { product: { status: { in: ["PUBLISHED", "GRAY"] } } } },
    include: { parameters: true, responseRules: true, version: { include: { product: { include: { upstream: { include: { nodes: true } }, accessGrants: true } } } } },
    orderBy: { routeVersion: "desc" },
  });
  const matched = candidates
    .map((endpoint) => ({ endpoint, pathParams: routeMatch(endpoint.publicPath, publicPath) }))
    .filter((item) => item.pathParams && (!routeVersion || item.endpoint.routeVersion === routeVersion))
    .sort((left, right) => {
      if (!routeVersion) {
        const versionOrder = right.endpoint.routeVersion.localeCompare(left.endpoint.routeVersion, undefined, { numeric: true });
        if (versionOrder) return versionOrder;
      }
      const methodOrder = Number(right.endpoint.methods.includes(requestedMethod)) - Number(left.endpoint.methods.includes(requestedMethod));
      if (methodOrder) return methodOrder;
      const staticOrder = routeStaticSegmentCount(right.endpoint.publicPath) - routeStaticSegmentCount(left.endpoint.publicPath);
      return staticOrder || right.endpoint.publicPath.length - left.endpoint.publicPath.length;
    })[0];
  if (!matched) return jsonError(404, "ROUTE_NOT_FOUND", "请求域名、路径、版本或方法未匹配到已发布路由", requestId);
  const { endpoint, pathParams } = matched;
  const product = endpoint.version.product;
  const upstream = product.upstream;
  if (!upstream) return jsonError(503, "UPSTREAM_NOT_CONFIGURED", "接口执行配置尚未完成", requestId);
  if (request.method === "OPTIONS") return endpoint.corsEnabled ? new Response(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) }) : jsonError(403, "CORS_DISABLED", "该接口未开放跨域请求", requestId);
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || url.protocol.replace(":", "");
  if (endpoint.forceHttps && forwardedProto !== "https" && process.env.NODE_ENV === "production") return jsonError(426, "HTTPS_REQUIRED", "该接口仅允许 HTTPS 请求", requestId);
  const ip = clientIp(request);
  if (endpoint.ipDenylist.includes(ip) || (endpoint.ipAllowlist.length && !endpoint.ipAllowlist.includes(ip))) return jsonError(403, "IP_DENIED", "当前来源 IP 不在允许范围内", requestId);
  if (product.visibility === "INTERNAL" && request.headers.get("x-star-internal-secret") !== process.env.INTERNAL_GATEWAY_SECRET) return jsonError(404, "ROUTE_NOT_FOUND", "接口不存在", requestId);

  const apiKey = await authenticateApiKey(bearerToken(request));
  if (!apiKey) return jsonError(401, "INVALID_API_KEY", "API Key 无效、过期或已撤销", requestId);
  if (apiKey.scopes.length && !apiKey.scopes.some((scope) => scope === "*" || scope === product.slug || scope === `api:${product.slug}`)) return jsonError(403, "SCOPE_DENIED", "API Key 未获得该接口的访问范围", requestId);
  const granted = product.accessGrants.some((grant) => grant.tenantId === apiKey.app.tenantId);
  if (product.visibility === "PRIVATE" && !granted) return jsonError(403, "PRIVATE_API_DENIED", "当前企业未获得该私有接口授权", requestId);
  if ((product.visibility === "GRAY" || product.status === "GRAY") && (apiKey.app.environment !== "TEST" || !granted)) return jsonError(403, "GRAY_API_DENIED", "该接口仅向已授权测试应用开放", requestId);
  const subscription = await prisma.subscription.findUnique({ where: { appId_productId: { appId: apiKey.appId, productId: product.id } } });
  if (!subscription || subscription.status !== "ACTIVE") return jsonError(403, "SUBSCRIPTION_REQUIRED", "应用尚未订阅该接口", requestId);
  const successfulUsage = await prisma.requestLog.count({ where: { appId: apiKey.appId, productId: product.id, occurredAt: { gte: monthStart() }, statusCode: { gte: 200, lt: 400 } } });
  const chargeableOnSuccess = product.billingMode === "PER_REQUEST" && BigInt(successfulUsage) >= product.freeQuotaMonthly && subscription.unitPrice.gt(0);
  if (chargeableOnSuccess && apiKey.app.tenant.balance.lt(subscription.unitPrice)) return jsonError(402, "INSUFFICIENT_BALANCE", "账户余额不足，请充值后重试", requestId);
  try {
    const limit = await consumeRateLimit(`starapi:qps:${subscription.id}:${Math.floor(Date.now() / 1000)}`, subscription.qpsLimit);
    if (!limit.allowed) return jsonError(429, "RATE_LIMITED", "请求频率超过订阅 QPS 限制", requestId, { "X-RateLimit-Remaining": "0" });
  } catch { return jsonError(503, "RATE_LIMIT_UNAVAILABLE", "实时限流服务暂不可用", requestId); }
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) return jsonError(413, "PAYLOAD_TOO_LARGE", "请求体不能超过 1 MB", requestId);
  const body = ["GET", "HEAD"].includes(request.method) ? null : new Uint8Array(await request.arrayBuffer());
  if (body && body.byteLength > MAX_BODY_BYTES) return jsonError(413, "PAYLOAD_TOO_LARGE", "请求体不能超过 1 MB", requestId);
  let parsedBody: unknown = null;
  if (body?.byteLength && request.headers.get("content-type")?.includes("application/json")) {
    try { parsedBody = JSON.parse(new TextDecoder().decode(body)); } catch { return jsonError(400, "INVALID_JSON", "请求体不是有效 JSON", requestId); }
  }
  url.searchParams.delete("api_version");
  parsedBody = applyParameterDefaults(endpoint.parameters, pathParams!, url.searchParams, parsedBody);
  if (product.internalHandler === "content.dataset" && parsedBody && typeof parsedBody === "object" && !Array.isArray(parsedBody)) {
    for (const parameter of endpoint.parameters.filter((item) => item.location === "QUERY" && !url.searchParams.has(item.name))) {
      const value = (parsedBody as Record<string, unknown>)[parameter.name];
      if (value !== undefined && value !== null) url.searchParams.set(parameter.name, String(value));
    }
  }
  const validationError = parameterError(endpoint.parameters, pathParams!, url.searchParams, parsedBody);
  if (validationError) return jsonError(400, "PARAMETER_INVALID", validationError, requestId);
  const mappedInput = mappedUpstreamInput(endpoint.parameters, url.searchParams, parsedBody, body);
  const reservation = await reserveGatewayUsage({
    requestId,
    subscriptionId: subscription.id,
    appId: apiKey.appId,
    apiKeyId: apiKey.id,
    productId: product.id,
    endpointId: endpoint.id,
    method: request.method,
    publicPath,
    region: request.headers.get("x-star-region")?.slice(0, 48) || "default",
  });
  if (!reservation.allowed) {
    if (reservation.reason === "MONTHLY_QUOTA_EXCEEDED") return jsonError(429, "MONTHLY_QUOTA_EXCEEDED", "本月调用配额已用尽", requestId);
    if (reservation.reason === "DAILY_LIMIT_EXCEEDED") return jsonError(429, "DAILY_LIMIT_EXCEEDED", "该接口今日调用上限已用尽", requestId);
    return jsonError(403, "SUBSCRIPTION_REQUIRED", "应用订阅已失效，请刷新后重试", requestId);
  }

  let statusCode = 500;
  let responseBytes = BigInt(0);
  let errorCode: string | null = null;
  let response: Response;
  let selectedNodeId: string | null = null;
  try {
    if (upstream.type === "CONTENT") {
      if (!isContentHandler(product.internalHandler)) throw new Error("CONTENT_HANDLER_MISSING");
      const content = await contentResponse(product.id, product.internalHandler, request, { executionConfig: product.executionConfig, parsedBody, query: url.searchParams, parameters: endpoint.parameters, pathParams: pathParams!, responseFormats: endpoint.responseFormats });
      response = content.response; responseBytes = content.responseBytes; statusCode = response.status;
    } else if (upstream.type === "PHP_PACKAGE") {
      const config = product.executionConfig && typeof product.executionConfig === "object" && !Array.isArray(product.executionConfig) ? product.executionConfig as Record<string, unknown> : {};
      const runtime = await executePhpPackage({ productId: product.id, entryFile: typeof config.entryFile === "string" ? config.entryFile : "index.php", request, relativePath: publicPath, body, timeoutMs: upstream.timeoutMs });
      response = runtime.response; responseBytes = BigInt(runtime.responseBytes); statusCode = response.status; errorCode = runtime.runtimeError;
    } else if (upstream.type === "BUILTIN") {
      const fallbackBody = body?.byteLength ? { value: new TextDecoder().decode(body), text: new TextDecoder().decode(body) } : null;
      const result = executeInternalHandler(product.internalHandler, { body: parsedBody ?? fallbackBody, query: url.searchParams });
      statusCode = result.status;
      const payload = JSON.stringify({ code: statusCode, message: statusCode < 400 ? "ok" : "request failed", requestId, data: result.data });
      responseBytes = BigInt(Buffer.byteLength(payload));
      response = new Response(payload, { status: statusCode, headers: { "Content-Type": "application/json; charset=utf-8" } });
    } else {
      const enabled = upstream.nodes.filter((node) => node.enabled);
      const available = enabled.filter((node) => node.healthStatus !== "UNHEALTHY");
      const node = chooseUpstreamNode(available.length ? available : enabled);
      selectedNodeId = node.id;
      const sourcePath = upstreamRequestPath(product.executionConfig, endpoint.path, publicPath, pathParams!);
      const targetPath = rewriteUpstreamPath(sourcePath, upstream.rewriteMode, upstream.upstreamPrefix);
      const result = await forwardRequest({ baseUrl: node.baseUrl, relativePath: targetPath, method: request.method, query: mappedInput.query ? `?${mappedInput.query}` : "", body: mappedInput.body, contentType: request.headers.get("content-type"), timeoutMs: upstream.timeoutMs, authType: upstream.authType, secrets: decryptJson(upstream.secretConfigEncrypted), kind: upstream.type, requestId });
      statusCode = result.response.status; responseBytes = BigInt(result.body.byteLength);
      response = new Response(result.body, { status: statusCode, headers: { "Content-Type": result.response.headers.get("content-type") ?? "application/octet-stream" } });
      await prisma.apiUpstreamNode.update({ where: { id: node.id }, data: { healthStatus: "HEALTHY", failureCount: 0, lastCheckedAt: new Date(), lastError: null } });
    }
  } catch (error) {
    const timeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError" || error.message === "PHP_RUNTIME_TIMEOUT");
    errorCode = timeout ? "UPSTREAM_TIMEOUT" : "UPSTREAM_UNAVAILABLE";
    statusCode = timeout ? 504 : 503;
    if (selectedNodeId) await prisma.apiUpstreamNode.update({ where: { id: selectedNodeId }, data: { healthStatus: "UNHEALTHY", failureCount: { increment: 1 }, lastCheckedAt: new Date(), lastError: error instanceof Error ? error.message.slice(0, 500) : "UPSTREAM_FAILED" } }).catch(() => undefined);
    response = jsonError(statusCode, errorCode, timeout ? "接口执行超时" : "上游服务暂不可用", requestId);
  }

  const responseRule = endpoint.responseRules.find((rule) => rule.statusCode === statusCode);
  response = await applyResponseRules(response, [...endpoint.parameters.filter((item) => item.sensitive).map((item) => item.name), ...(responseRule?.maskedFields ?? [])]);
  responseBytes = BigInt(response.headers.get("content-length") ?? responseBytes);

  const success = statusCode >= 200 && statusCode < 400;
  const billableUnits = success ? BigInt(1) : BigInt(0);
  const metered = success && product.billingMode === "PER_REQUEST" && subscription.unitPrice.gt(0);
  const usage = await prisma.$transaction(async (transaction) => {
    let previousBalance: Prisma.Decimal | null = null;
    let currentBalance: Prisma.Decimal | null = null;
    let chargeable = false;
    let charged = false;
    const amount = subscription.unitPrice;
    if (metered) {
      const tenant = await lockTenantBalance(transaction, apiKey.app.tenantId);
      if (!tenant) throw new Error("TENANT_NOT_FOUND");
      previousBalance = tenant.balance;
      const successfulBefore = await transaction.requestLog.count({ where: { appId: apiKey.appId, productId: product.id, occurredAt: { gte: monthStart() }, statusCode: { gte: 200, lt: 400 } } });
      chargeable = BigInt(successfulBefore) >= product.freeQuotaMonthly;
      if (chargeable && tenant.balance.gte(amount)) {
        currentBalance = tenant.balance.sub(amount);
        await transaction.tenant.update({ where: { id: tenant.id }, data: { balance: currentBalance } });
        charged = true;
      }
    }
    const finalStatus = chargeable && !charged ? 402 : statusCode;
    const finalError = finalStatus === 402 ? "INSUFFICIENT_BALANCE" : errorCode;
    const log = await transaction.requestLog.update({ where: { id: requestId }, data: { statusCode: finalStatus, latencyMs: Date.now() - startedAt, billableUnits: finalStatus === 402 ? BigInt(0) : billableUnits, amount: charged ? amount : new Prisma.Decimal(0), responseBytes: finalStatus === 402 ? BigInt(0) : responseBytes, errorCode: finalError, billed: charged } });
    if (charged && currentBalance) await transaction.walletEntry.create({ data: { tenantId: apiKey.app.tenantId, requestLogId: log.id, type: "API_USAGE", delta: amount.negated(), balanceAfter: currentBalance, reason: `${product.name} API 调用` } });
    return { insufficient: finalStatus === 402, previousBalance, currentBalance, chargedAmount: charged ? amount : new Prisma.Decimal(0) };
  });
  if (usage.insufficient) {
    response = jsonError(402, "INSUFFICIENT_BALANCE", "账户余额不足，请充值后重试", requestId);
    statusCode = 402;
  }
  if (usage.previousBalance && usage.currentBalance) queueLowBalanceAlert({ tenantId: apiKey.app.tenantId, dedupeKey: requestId, previousBalance: usage.previousBalance.toString(), currentBalance: usage.currentBalance.toString() });
  queueQuotaAlert({ tenantId: apiKey.app.tenantId, subscriptionId: subscription.id, appId: apiKey.appId, appName: apiKey.app.name, usedBefore: reservation.monthly.usedBefore, usedAfter: reservation.monthly.usedAfter, quota: subscription.quotaMonthly, period: monthPeriod() });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Star-Request-Id", requestId);
  response.headers.set("X-Billable-Units", usage.insufficient ? "0" : billableUnits.toString());
  response.headers.set("X-Request-Cost", usage.chargedAmount.toString());
  if (endpoint.corsEnabled) for (const [key, value] of Object.entries(corsHeaders(request.headers.get("origin")))) response.headers.set(key, value);
  return response;
}
