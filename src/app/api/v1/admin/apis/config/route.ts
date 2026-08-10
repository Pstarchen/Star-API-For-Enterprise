import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { normalizePublicHost, normalizePublicPath } from "@/lib/api-routes";
import { getCurrentUser, getCurrentWorkspace } from "@/lib/server/auth";
import { findRouteConflict } from "@/lib/server/api-routing";
import { getCatalogProduct } from "@/lib/server/catalog";
import { encryptJson } from "@/lib/server/encryption";
import { prisma } from "@/lib/server/prisma";
import { noStoreHeaders, requestIp } from "@/lib/server/request";
import { assertSafeUpstream, checkUpstreamHealth } from "@/lib/server/upstream";

const pathSchema = z.string().trim().max(180).regex(/^\/(?:[A-Za-z0-9._~!$&'()*+,;=:@%{}-]+\/?)*$/).transform(normalizePublicPath);
const hostSchema = z.string().trim().toLowerCase().min(1).max(253).regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/).transform(normalizePublicHost);
const nodeSchema = z.object({ id: z.string().optional(), name: z.string().trim().min(1).max(80), baseUrl: z.url(), weight: z.coerce.number().int().min(1).max(10000), enabled: z.boolean() }).strict();
const parameterSchema = z.object({ location: z.enum(["PATH", "QUERY", "BODY"]), name: z.string().trim().min(1).max(80), upstreamName: z.string().trim().max(80).optional().default(""), required: z.boolean(), dataType: z.enum(["string", "integer", "number", "boolean", "array", "object"]), pattern: z.string().max(300).optional().default(""), sensitive: z.boolean() }).strict();
const updateSchema = z.object({
  id: z.string().min(1),
  visibility: z.enum(["PUBLIC", "PRIVATE", "GRAY", "INTERNAL"]),
  billingMode: z.enum(["FREE", "PER_REQUEST"]),
  unitPrice: z.coerce.number().min(0).max(100000),
  freeQuotaMonthly: z.coerce.number().int().min(0).max(1_000_000_000),
  defaultQpsLimit: z.coerce.number().int().min(1).max(100000),
  route: z.object({ publicHost: hostSchema, publicPath: pathSchema, routeVersion: z.string().trim().min(1).max(24), method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "ALL"]), requestFormat: z.enum(["JSON", "FORM", "BINARY", "ANY"]), corsEnabled: z.boolean(), forceHttps: z.boolean(), requestLogging: z.boolean(), dailyLimit: z.coerce.number().int().min(0).max(1_000_000_000), ipAllowlist: z.array(z.string().trim().min(1).max(64)).max(200), ipDenylist: z.array(z.string().trim().min(1).max(64)).max(200) }).strict(),
  upstream: z.object({ rewriteMode: z.enum(["PASSTHROUGH", "PREFIX"]), upstreamPrefix: z.string().trim().max(180), healthPath: pathSchema, timeoutMs: z.coerce.number().int().min(500).max(60000), authType: z.enum(["NONE", "BEARER", "HEADER"]), preserveSecret: z.boolean().default(false), token: z.string().max(4000).optional().default(""), headerName: z.string().trim().max(80).optional().default(""), headerValue: z.string().max(4000).optional().default(""), nodes: z.array(nodeSchema).max(20) }).strict(),
  parameters: z.array(parameterSchema).max(200),
}).strict().superRefine((value, context) => {
  if (value.billingMode === "PER_REQUEST" && value.unitPrice <= 0) context.addIssue({ code: "custom", path: ["unitPrice"], message: "收费 API 单价必须大于 0" });
  if (value.upstream.rewriteMode === "PREFIX" && !value.upstream.upstreamPrefix) context.addIssue({ code: "custom", path: ["upstream", "upstreamPrefix"], message: "请填写上游前缀" });
  if (value.upstream.authType === "BEARER" && !value.upstream.token && !value.upstream.preserveSecret) context.addIssue({ code: "custom", path: ["upstream", "token"], message: "请填写新的 Bearer Token" });
  if (value.upstream.authType === "HEADER" && (!value.upstream.headerName || !value.upstream.headerValue) && !value.upstream.preserveSecret) context.addIssue({ code: "custom", path: ["upstream", "headerName"], message: "请填写鉴权请求头名称和值" });
});
const cloneSchema = z.object({ action: z.literal("clone"), id: z.string().min(1), name: z.string().trim().min(2).max(80), slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), publicPath: pathSchema }).strict();
const testSchema = z.object({ action: z.literal("health"), id: z.string().min(1) }).strict();

async function editor() {
  const user = await getCurrentUser();
  if (!user) return { error: Response.json({ code: 401, message: "请先登录" }, { status: 401, headers: noStoreHeaders }) } as const;
  if (user.platformRole === "ADMIN") return { user, workspace: await getCurrentWorkspace(user), isAdmin: true } as const;
  const workspace = await getCurrentWorkspace(user);
  if (!workspace || workspace.tenant.type !== "ENTERPRISE" || !["OWNER", "ADMIN"].includes(workspace.role)) return { error: Response.json({ code: 403, message: "当前账号没有服务商 API 管理权限" }, { status: 403, headers: noStoreHeaders }) } as const;
  return { user, workspace, isAdmin: false } as const;
}

async function managedProduct(id: string, auth: Exclude<Awaited<ReturnType<typeof editor>>, { error: Response }>) {
  const product = await prisma.apiProduct.findUnique({ where: { id }, include: { provider: true, upstream: { include: { nodes: { orderBy: { name: "asc" } } } }, versions: { orderBy: { version: "desc" }, take: 1, include: { endpoints: { take: 1, include: { parameters: true, responseRules: true, testCases: true } } } }, audits: { orderBy: { createdAt: "desc" }, take: 20 }, assets: true } });
  if (!product || (!auth.isAdmin && product.provider.ownerTenantId !== auth.workspace.tenantId)) return null;
  return product;
}

export async function GET(request: Request) {
  const auth = await editor();
  if ("error" in auth) return auth.error;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ code: 400, message: "缺少 API ID" }, { status: 400, headers: noStoreHeaders });
  const product = await managedProduct(id, auth);
  if (!product) return Response.json({ code: 404, message: "API 不存在或无权访问" }, { status: 404, headers: noStoreHeaders });
  const endpoint = product.versions[0]?.endpoints[0];
  return Response.json({ code: 200, data: { id: product.id, name: product.name, slug: product.slug, status: product.status, visibility: product.visibility, billingMode: product.billingMode, unitPrice: product.unitPrice.toString(), freeQuotaMonthly: product.freeQuotaMonthly.toString(), defaultQpsLimit: product.defaultQpsLimit, route: endpoint ? { id: endpoint.id, publicHost: endpoint.publicHost, publicPath: endpoint.publicPath, routeVersion: endpoint.routeVersion, method: endpoint.method, requestFormat: endpoint.requestFormat, corsEnabled: endpoint.corsEnabled, forceHttps: endpoint.forceHttps, requestLogging: endpoint.requestLogging, dailyLimit: endpoint.dailyLimit.toString(), ipAllowlist: endpoint.ipAllowlist, ipDenylist: endpoint.ipDenylist } : null, upstream: product.upstream ? { id: product.upstream.id, type: product.upstream.type, rewriteMode: product.upstream.rewriteMode, upstreamPrefix: product.upstream.upstreamPrefix, healthPath: product.upstream.healthPath, healthStatus: product.upstream.healthStatus, timeoutMs: product.upstream.timeoutMs, authType: product.upstream.authType, secretConfigured: Boolean(product.upstream.secretConfigEncrypted), nodes: product.upstream.nodes.map((node) => ({ id: node.id, name: node.name, baseUrl: node.baseUrl, weight: node.weight, enabled: node.enabled, healthStatus: node.healthStatus, failureCount: node.failureCount, lastCheckedAt: node.lastCheckedAt?.toISOString() ?? null, lastError: node.lastError })) } : null, parameters: endpoint?.parameters.map((item) => ({ id: item.id, location: item.location, name: item.name, upstreamName: item.upstreamName ?? "", required: item.required, dataType: item.dataType, pattern: item.validation && typeof item.validation === "object" && !Array.isArray(item.validation) && "pattern" in item.validation ? String(item.validation.pattern ?? "") : "", sensitive: item.sensitive })) ?? [], audits: product.audits.map((audit) => ({ ...audit, createdAt: audit.createdAt.toISOString() })), assetCount: product.assets.length } }, { headers: noStoreHeaders });
}

export async function PATCH(request: Request) {
  const auth = await editor();
  if ("error" in auth) return auth.error;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: 400, message: "配置内容不正确", details: z.flattenError(parsed.error) }, { status: 400, headers: noStoreHeaders });
  const product = await managedProduct(parsed.data.id, auth);
  if (!product || !product.upstream || !product.versions[0]?.endpoints[0]) return Response.json({ code: 404, message: "API 配置不存在或无权访问" }, { status: 404, headers: noStoreHeaders });
  if (!auth.isAdmin && product.upstream.type === "SERVER_LOCAL") return Response.json({ code: 403, message: "服务商不能修改服务器内网上游" }, { status: 403, headers: noStoreHeaders });
  if (["PUBLIC_API", "SERVER_LOCAL", "TUNNEL"].includes(product.upstream.type) && !parsed.data.upstream.nodes.length) return Response.json({ code: 400, message: "网络上游至少需要一个节点" }, { status: 400, headers: noStoreHeaders });
  const endpoint = product.versions[0].endpoints[0];
  const routeConflict = await findRouteConflict({ publicHost: parsed.data.route.publicHost, publicPath: parsed.data.route.publicPath, routeVersion: parsed.data.route.routeVersion, method: parsed.data.route.method, excludeEndpointId: endpoint.id });
  if (routeConflict) return Response.json({ code: 409, message: `公开路由与“${routeConflict.version.product.name}”冲突` }, { status: 409, headers: noStoreHeaders });
  try {
    for (const node of parsed.data.upstream.nodes) await assertSafeUpstream(node.baseUrl, product.upstream.type as "PUBLIC_API" | "SERVER_LOCAL" | "TUNNEL");
  } catch (error) { return Response.json({ code: 400, message: `上游地址不允许：${error instanceof Error ? error.message : "INVALID_UPSTREAM"}` }, { status: 400, headers: noStoreHeaders }); }
  const secret = parsed.data.upstream.preserveSecret ? undefined : parsed.data.upstream.authType === "BEARER" ? { token: parsed.data.upstream.token } : parsed.data.upstream.authType === "HEADER" ? { headerName: parsed.data.upstream.headerName, headerValue: parsed.data.upstream.headerValue } : null;
  try {
    await prisma.$transaction(async (transaction) => {
      await transaction.apiProduct.update({ where: { id: product.id }, data: { status: "DRAFT", visibility: parsed.data.visibility, billingMode: parsed.data.billingMode, unitPrice: parsed.data.billingMode === "FREE" ? 0 : parsed.data.unitPrice, freeQuotaMonthly: parsed.data.freeQuotaMonthly, defaultQpsLimit: parsed.data.defaultQpsLimit } });
      await transaction.endpoint.update({ where: { id: endpoint.id }, data: { publicHost: parsed.data.route.publicHost, publicPath: parsed.data.route.publicPath, routeVersion: parsed.data.route.routeVersion, method: parsed.data.route.method, requestFormat: parsed.data.route.requestFormat, corsEnabled: parsed.data.route.corsEnabled, forceHttps: parsed.data.route.forceHttps, requestLogging: parsed.data.route.requestLogging, dailyLimit: parsed.data.route.dailyLimit, ipAllowlist: parsed.data.route.ipAllowlist, ipDenylist: parsed.data.route.ipDenylist } });
      await transaction.apiUpstream.update({ where: { id: product.upstream!.id }, data: { rewriteMode: parsed.data.upstream.rewriteMode, upstreamPrefix: parsed.data.upstream.upstreamPrefix, healthPath: parsed.data.upstream.healthPath, timeoutMs: parsed.data.upstream.timeoutMs, authType: parsed.data.upstream.authType, healthStatus: "UNKNOWN", lastHealthError: null, ...(secret ? { secretConfigEncrypted: encryptJson(secret) } : secret === null ? { secretConfigEncrypted: null } : {}) } });
      await transaction.apiUpstreamNode.deleteMany({ where: { upstreamId: product.upstream!.id } });
      if (parsed.data.upstream.nodes.length) await transaction.apiUpstreamNode.createMany({ data: parsed.data.upstream.nodes.map((node) => ({ upstreamId: product.upstream!.id, name: node.name, baseUrl: node.baseUrl, weight: node.weight, enabled: node.enabled })) });
      await transaction.apiParameter.deleteMany({ where: { endpointId: endpoint.id } });
      if (parsed.data.parameters.length) await transaction.apiParameter.createMany({ data: parsed.data.parameters.map((parameter) => ({ endpointId: endpoint.id, location: parameter.location, name: parameter.name, upstreamName: parameter.upstreamName || null, required: parameter.required, dataType: parameter.dataType, validation: parameter.pattern ? { pattern: parameter.pattern } : {}, sensitive: parameter.sensitive })) });
      await transaction.auditLog.create({ data: { tenantId: auth.workspace?.tenantId, actorId: auth.user.id, action: "api.config.update", resource: "api-product", resourceId: product.id, metadata: { route: parsed.data.route.publicPath, nodes: parsed.data.upstream.nodes.length, parameters: parsed.data.parameters.length }, ipAddress: requestIp(request) } });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ code: 409, message: "公开域名、路径、版本和方法与现有路由冲突" }, { status: 409, headers: noStoreHeaders });
    return Response.json({ code: 500, message: "API 配置保存失败" }, { status: 500, headers: noStoreHeaders });
  }
  revalidatePath("/", "layout");
  return Response.json({ code: 200, message: "配置已保存并回到草稿状态", data: await getCatalogProduct(product.slug, false) }, { headers: noStoreHeaders });
}

export async function POST(request: Request) {
  const auth = await editor();
  if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => null);
  const health = testSchema.safeParse(body);
  if (health.success) {
    const product = await managedProduct(health.data.id, auth);
    if (!product?.upstream) return Response.json({ code: 404, message: "API 上游配置不存在" }, { status: 404, headers: noStoreHeaders });
    if (!["PUBLIC_API", "SERVER_LOCAL", "TUNNEL"].includes(product.upstream.type)) return Response.json({ code: 200, message: product.upstream.type === "PHP_PACKAGE" ? "PHP 程序包将在发布后由隔离运行器执行" : "平台内置能力无需外部健康检查", data: { healthy: true } }, { headers: noStoreHeaders });
    const results = [];
    for (const node of product.upstream.nodes.filter((item) => item.enabled)) {
      try { const status = await checkUpstreamHealth({ baseUrl: node.baseUrl, healthPath: product.upstream.healthPath, timeoutMs: product.upstream.timeoutMs, kind: product.upstream.type as "PUBLIC_API" | "SERVER_LOCAL" | "TUNNEL" }); results.push({ id: node.id, name: node.name, healthy: true, status }); await prisma.apiUpstreamNode.update({ where: { id: node.id }, data: { healthStatus: "HEALTHY", failureCount: 0, lastCheckedAt: new Date(), lastError: null } }); }
      catch (error) { const message = error instanceof Error ? error.message : "HEALTH_CHECK_FAILED"; results.push({ id: node.id, name: node.name, healthy: false, error: message }); await prisma.apiUpstreamNode.update({ where: { id: node.id }, data: { healthStatus: "UNHEALTHY", failureCount: { increment: 1 }, lastCheckedAt: new Date(), lastError: message } }); }
    }
    const healthyCount = results.filter((item) => item.healthy).length;
    await prisma.apiUpstream.update({ where: { id: product.upstream.id }, data: { healthStatus: healthyCount ? "HEALTHY" : "UNHEALTHY", lastHealthCheckAt: new Date(), lastHealthError: healthyCount ? null : "所有上游节点均不可用" } });
    return Response.json({ code: healthyCount ? 200 : 503, message: healthyCount ? `${healthyCount} 个节点健康` : "所有上游节点均不可用", data: { healthy: Boolean(healthyCount), results } }, { status: healthyCount ? 200 : 503, headers: noStoreHeaders });
  }
  const clone = cloneSchema.safeParse(body);
  if (!clone.success) return Response.json({ code: 400, message: "操作参数不正确" }, { status: 400, headers: noStoreHeaders });
  const source = await managedProduct(clone.data.id, auth);
  const sourceEndpoint = source?.versions[0]?.endpoints[0];
  if (!source || !source.upstream || !sourceEndpoint) return Response.json({ code: 404, message: "源 API 不存在或无权访问" }, { status: 404, headers: noStoreHeaders });
  const routeConflict = await findRouteConflict({ publicHost: sourceEndpoint.publicHost, publicPath: clone.data.publicPath, routeVersion: sourceEndpoint.routeVersion, method: sourceEndpoint.method });
  if (routeConflict) return Response.json({ code: 409, message: `克隆路由与“${routeConflict.version.product.name}”冲突` }, { status: 409, headers: noStoreHeaders });
  try {
    await prisma.$transaction(async (transaction) => {
      const product = await transaction.apiProduct.create({ data: { providerId: source.providerId, slug: clone.data.slug, name: clone.data.name, shortName: Array.from(clone.data.name).slice(0, 4).join(""), description: source.description, category: source.category, color: source.color, tags: source.tags, featured: false, status: "DRAFT", visibility: source.visibility, sla: source.sla, internalHandler: source.internalHandler, executionConfig: source.executionConfig as Prisma.InputJsonValue, billingMode: source.billingMode, unitPrice: source.unitPrice, freeQuotaMonthly: source.freeQuotaMonthly, defaultQpsLimit: source.defaultQpsLimit } });
      const upstream = await transaction.apiUpstream.create({ data: { productId: product.id, type: source.upstream!.type, rewriteMode: source.upstream!.rewriteMode, upstreamPrefix: source.upstream!.upstreamPrefix, healthPath: source.upstream!.healthPath, timeoutMs: source.upstream!.timeoutMs, offlineOnFailure: source.upstream!.offlineOnFailure, authType: source.upstream!.authType, secretConfigEncrypted: source.upstream!.secretConfigEncrypted, allowPrivateNetwork: source.upstream!.allowPrivateNetwork } });
      if (source.upstream!.nodes.length) await transaction.apiUpstreamNode.createMany({ data: source.upstream!.nodes.map((node) => ({ upstreamId: upstream.id, name: node.name, baseUrl: node.baseUrl, weight: node.weight, enabled: node.enabled })) });
      const version = await transaction.apiVersion.create({ data: { productId: product.id, version: source.versions[0].version, basePath: source.versions[0].basePath } });
      const endpoint = await transaction.endpoint.create({ data: { versionId: version.id, method: sourceEndpoint.method, path: clone.data.publicPath, publicHost: sourceEndpoint.publicHost, publicPath: clone.data.publicPath, routeVersion: sourceEndpoint.routeVersion, requestFormat: sourceEndpoint.requestFormat, summary: clone.data.name, schema: sourceEndpoint.schema as Prisma.InputJsonValue, corsEnabled: sourceEndpoint.corsEnabled, forceHttps: sourceEndpoint.forceHttps, ipAllowlist: sourceEndpoint.ipAllowlist, ipDenylist: sourceEndpoint.ipDenylist, dailyLimit: sourceEndpoint.dailyLimit, requestLogging: sourceEndpoint.requestLogging } });
      if (sourceEndpoint.parameters.length) await transaction.apiParameter.createMany({ data: sourceEndpoint.parameters.map((item) => ({ endpointId: endpoint.id, location: item.location, name: item.name, upstreamName: item.upstreamName, required: item.required, dataType: item.dataType, validation: item.validation as Prisma.InputJsonValue, sensitive: item.sensitive })) });
      if (source.assets.length) await transaction.apiAsset.createMany({ data: source.assets.map((asset) => ({ productId: product.id, kind: asset.kind, name: asset.name, mimeType: asset.mimeType, data: asset.data, size: asset.size })) });
      await transaction.auditLog.create({ data: { tenantId: auth.workspace?.tenantId, actorId: auth.user.id, action: "api.clone", resource: "api-product", resourceId: product.id, metadata: { sourceId: source.id, slug: clone.data.slug }, ipAddress: requestIp(request) } });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ code: 409, message: "新标识或公开路由已存在" }, { status: 409, headers: noStoreHeaders });
    return Response.json({ code: 500, message: "API 克隆失败" }, { status: 500, headers: noStoreHeaders });
  }
  revalidatePath("/", "layout");
  return Response.json({ code: 201, message: "API 已克隆为草稿", data: await getCatalogProduct(clone.data.slug, false) }, { status: 201, headers: noStoreHeaders });
}
