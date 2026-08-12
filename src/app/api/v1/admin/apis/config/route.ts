import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { apiDataTypes, apiHttpMethods, apiParameterLocations, apiResponseFormats, generateResponseExample, normalizeMethods } from "@/lib/api-contracts";
import { normalizePublicHost, normalizePublicPath } from "@/lib/api-routes";
import { internalHandlerTemplates, isContentHandler, phpHandlerId } from "@/lib/internal-handlers";
import { resolvePhpEntryFile } from "@/lib/php-package";
import { assetErrorMessage, inferPreparedDatasetContract, preparedContentResponseExample } from "@/lib/server/api-assets";
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
const optionalText = (maximum: number) => z.string().trim().max(maximum).optional().default("");
const parameterSchema = z.object({ location: z.enum(apiParameterLocations), name: z.string().trim().min(1).max(80), upstreamName: optionalText(160), required: z.boolean(), dataType: z.enum(apiDataTypes), defaultValue: optionalText(500), description: optionalText(1000), pattern: optionalText(300), sensitive: z.boolean() }).strict();
const responseParameterSchema = z.object({ name: z.string().trim().min(1).max(120), dataType: z.enum(apiDataTypes), description: optionalText(1000) }).strict();
const datasetSchema = z.object({ grouping: z.enum(["FILE", "MERGED"]).default("MERGED"), contractMode: z.enum(["AUTO", "MANUAL"]).default("MANUAL"), categoryParameter: optionalText(80), formatParameter: optionalText(80), menuValue: optionalText(80), defaultFormat: z.enum(["TXT", "JSON"]).default("JSON"), textField: optionalText(160), itemsPath: optionalText(160) }).strict();
const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(2).max(80),
  shortName: z.string().trim().min(1).max(4),
  description: z.string().trim().min(1).max(1000),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  tags: z.array(z.string().trim().min(1).max(24)).max(10),
  featured: z.boolean(),
  sla: z.coerce.number().min(0).max(100),
  categoryId: z.string().min(1, "请选择 API 分类"),
  visibility: z.enum(["PUBLIC", "PRIVATE", "GRAY", "INTERNAL"]),
  billingMode: z.enum(["FREE", "PER_REQUEST"]),
  unitPrice: z.coerce.number().min(0).max(100000),
  freeQuotaMonthly: z.coerce.number().int().min(0).max(1_000_000_000),
  defaultQpsLimit: z.coerce.number().int().min(1).max(100000),
  route: z.object({ publicHost: hostSchema, publicPath: pathSchema, routeVersion: z.string().trim().min(1).max(24), methods: z.array(z.enum(apiHttpMethods)).min(1).max(apiHttpMethods.length).transform(normalizeMethods), requestFormat: z.enum(["JSON", "FORM", "BINARY", "ANY"]), responseFormats: z.array(z.enum(apiResponseFormats)).min(1).max(apiResponseFormats.length), responseExample: z.unknown().optional(), summary: z.string().trim().max(160), corsEnabled: z.boolean(), forceHttps: z.boolean(), requestLogging: z.boolean(), dailyLimit: z.coerce.number().int().min(0).max(1_000_000_000), ipAllowlist: z.array(z.string().trim().min(1).max(64)).max(200), ipDenylist: z.array(z.string().trim().min(1).max(64)).max(200) }).strict(),
  upstream: z.object({ rewriteMode: z.enum(["PASSTHROUGH", "PREFIX", "EXACT"]), upstreamPrefix: z.string().trim().max(180), healthPath: pathSchema, timeoutMs: z.coerce.number().int().min(500).max(60000), authType: z.enum(["NONE", "BEARER", "HEADER"]), preserveSecret: z.boolean().default(false), token: z.string().max(4000).optional().default(""), headerName: z.string().trim().max(80).optional().default(""), headerValue: z.string().max(4000).optional().default(""), nodes: z.array(nodeSchema).max(20) }).strict(),
  parameters: z.array(parameterSchema).max(200),
  responseParameters: z.array(responseParameterSchema).max(200),
  dataset: datasetSchema.optional(),
  entryFile: z.string().trim().max(180).optional(),
}).strict().superRefine((value, context) => {
  if (value.billingMode === "PER_REQUEST" && value.unitPrice <= 0) context.addIssue({ code: "custom", path: ["unitPrice"], message: "收费 API 单价必须大于 0" });
  if (value.upstream.rewriteMode === "PREFIX" && !value.upstream.upstreamPrefix) context.addIssue({ code: "custom", path: ["upstream", "upstreamPrefix"], message: "请填写上游前缀" });
  if (value.upstream.authType === "BEARER" && !value.upstream.token && !value.upstream.preserveSecret) context.addIssue({ code: "custom", path: ["upstream", "token"], message: "请填写新的 Bearer Token" });
  if (value.upstream.authType === "HEADER" && (!value.upstream.headerName || !value.upstream.headerValue) && !value.upstream.preserveSecret) context.addIssue({ code: "custom", path: ["upstream", "headerName"], message: "请填写鉴权请求头名称和值" });
  const duplicateNode = value.upstream.nodes.find((node, index) => value.upstream.nodes.findIndex((candidate) => candidate.baseUrl === node.baseUrl) !== index);
  if (duplicateNode) context.addIssue({ code: "custom", path: ["upstream", "nodes"], message: `上游节点地址重复：${duplicateNode.baseUrl}` });
  const duplicateParameter = value.parameters.find((parameter, index) => value.parameters.findIndex((candidate) => candidate.location === parameter.location && candidate.name === parameter.name) !== index);
  if (duplicateParameter) context.addIssue({ code: "custom", path: ["parameters"], message: `${duplicateParameter.location} 参数名称重复：${duplicateParameter.name}` });
  const duplicateResponse = value.responseParameters.find((parameter, index) => value.responseParameters.findIndex((candidate) => candidate.name === parameter.name) !== index);
  if (duplicateResponse) context.addIssue({ code: "custom", path: ["responseParameters"], message: `返回参数名称重复：${duplicateResponse.name}` });
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
  const product = await prisma.apiProduct.findUnique({ where: { id }, include: { provider: true, category: true, upstream: { include: { nodes: { orderBy: { name: "asc" } } } }, versions: { orderBy: { version: "desc" }, take: 1, include: { endpoints: { take: 1, include: { parameters: true, responseParameters: { orderBy: { sortOrder: "asc" } }, responseRules: true, testCases: true } } } }, audits: { orderBy: { createdAt: "desc" }, take: 20 }, assets: true } });
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
  const executionConfig = product.executionConfig && typeof product.executionConfig === "object" && !Array.isArray(product.executionConfig) ? product.executionConfig as Record<string, unknown> : {};
  const rawDataset = executionConfig.dataset && typeof executionConfig.dataset === "object" && !Array.isArray(executionConfig.dataset) ? executionConfig.dataset as Record<string, unknown> : null;
  const dataset = product.internalHandler === "content.dataset" ? { grouping: rawDataset?.grouping === "FILE" ? "FILE" : "MERGED", contractMode: rawDataset?.contractMode === "AUTO" ? "AUTO" : "MANUAL", categoryParameter: typeof rawDataset?.categoryParameter === "string" ? rawDataset.categoryParameter : "", formatParameter: typeof rawDataset?.formatParameter === "string" ? rawDataset.formatParameter : "", menuValue: typeof rawDataset?.menuValue === "string" ? rawDataset.menuValue : "", defaultFormat: rawDataset?.defaultFormat === "TXT" ? "TXT" : "JSON", textField: typeof rawDataset?.textField === "string" ? rawDataset.textField : "", itemsPath: typeof rawDataset?.itemsPath === "string" ? rawDataset.itemsPath : "" } : null;
  return Response.json({
    code: 200,
    data: {
      id: product.id,
      name: product.name,
      slug: product.slug,
      shortName: product.shortName,
      description: product.description,
      color: product.color,
      tags: product.tags,
      featured: product.featured,
      canFeature: auth.isAdmin,
      sla: product.sla.toString(),
      status: product.status,
      categoryId: product.categoryId,
      category: product.category.name,
      visibility: product.visibility,
      billingMode: product.billingMode,
      unitPrice: product.unitPrice.toString(),
      freeQuotaMonthly: product.freeQuotaMonthly.toString(),
      defaultQpsLimit: product.defaultQpsLimit,
      route: endpoint ? {
        publicHost: endpoint.publicHost,
        publicPath: endpoint.publicPath,
        routeVersion: endpoint.routeVersion,
        methods: endpoint.methods,
        requestFormat: endpoint.requestFormat,
        responseFormats: endpoint.responseFormats,
        responseExample: endpoint.responseExample,
        summary: endpoint.summary,
        corsEnabled: endpoint.corsEnabled,
        forceHttps: endpoint.forceHttps,
        requestLogging: endpoint.requestLogging,
        dailyLimit: endpoint.dailyLimit.toString(),
        ipAllowlist: endpoint.ipAllowlist,
        ipDenylist: endpoint.ipDenylist,
      } : null,
      upstream: product.upstream ? {
        type: product.upstream.type,
        rewriteMode: product.upstream.rewriteMode,
        upstreamPrefix: product.upstream.upstreamPrefix,
        healthPath: product.upstream.healthPath,
        healthStatus: product.upstream.healthStatus,
        timeoutMs: product.upstream.timeoutMs,
        authType: product.upstream.authType,
        secretConfigured: Boolean(product.upstream.secretConfigEncrypted),
        nodes: product.upstream.nodes.map((node) => ({ id: node.id, name: node.name, baseUrl: node.baseUrl, weight: node.weight, enabled: node.enabled, healthStatus: node.healthStatus, failureCount: node.failureCount, lastCheckedAt: node.lastCheckedAt?.toISOString() ?? null, lastError: node.lastError })),
      } : null,
      parameters: endpoint?.parameters.map((item) => ({ id: item.id, location: item.location, name: item.name, upstreamName: item.upstreamName ?? "", required: item.required, dataType: item.dataType, defaultValue: item.defaultValue ?? "", description: item.description, pattern: item.validation && typeof item.validation === "object" && !Array.isArray(item.validation) && "pattern" in item.validation ? String(item.validation.pattern ?? "") : "", sensitive: item.sensitive })) ?? [],
      responseParameters: endpoint?.responseParameters.map((item) => ({ id: item.id, name: item.name, dataType: item.dataType, description: item.description })) ?? [],
      dataset,
      entryFile: product.internalHandler === phpHandlerId && typeof executionConfig.entryFile === "string" ? executionConfig.entryFile : null,
      audits: product.audits.map((audit) => ({ ...audit, createdAt: audit.createdAt.toISOString() })),
      assetCount: product.assets.length,
    },
  }, { headers: noStoreHeaders });
}

export async function PATCH(request: Request) {
  const auth = await editor();
  if ("error" in auth) return auth.error;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: 400, message: "配置内容不正确", details: z.flattenError(parsed.error) }, { status: 400, headers: noStoreHeaders });
  const product = await managedProduct(parsed.data.id, auth);
  if (!product || !product.upstream || !product.versions[0]?.endpoints[0]) return Response.json({ code: 404, message: "API 配置不存在或无权访问" }, { status: 404, headers: noStoreHeaders });
  const category = await prisma.apiCategory.findFirst({ where: { id: parsed.data.categoryId, enabled: true } });
  if (!category) return Response.json({ code: 400, message: "所选 API 分类不存在或已停用" }, { status: 400, headers: noStoreHeaders });
  if (!auth.isAdmin && product.upstream.type === "SERVER_LOCAL") return Response.json({ code: 403, message: "服务商不能修改服务器内网上游" }, { status: 403, headers: noStoreHeaders });
  if (["PUBLIC_API", "SERVER_LOCAL", "TUNNEL"].includes(product.upstream.type) && !parsed.data.upstream.nodes.length) return Response.json({ code: 400, message: "网络上游至少需要一个节点" }, { status: 400, headers: noStoreHeaders });
  if (parsed.data.upstream.preserveSecret && parsed.data.upstream.authType !== "NONE" && parsed.data.upstream.authType !== product.upstream.authType) return Response.json({ code: 400, message: "切换上游鉴权类型时必须填写新的鉴权凭据" }, { status: 400, headers: noStoreHeaders });
  const endpoint = product.versions[0].endpoints[0];
  if (product.internalHandler !== phpHandlerId && parsed.data.route.methods.includes("ALL")) return Response.json({ code: 400, message: "仅 PHP 程序包支持全部请求方法" }, { status: 400, headers: noStoreHeaders });
  const builtinTemplate = internalHandlerTemplates.find((item) => item.id === product.internalHandler);
  if (builtinTemplate && parsed.data.route.methods.some((method) => !(builtinTemplate.methods as readonly string[]).includes(method))) return Response.json({ code: 400, message: "该内置工具不支持所选请求方法" }, { status: 400, headers: noStoreHeaders });
  if (product.internalHandler === "content.dataset") {
    if (!parsed.data.dataset) return Response.json({ code: 400, message: "数据源执行配置不完整" }, { status: 400, headers: noStoreHeaders });
    if (parsed.data.route.responseFormats.some((format) => format === "BINARY")) return Response.json({ code: 400, message: "通用数据源仅支持 TXT 和 JSON 响应" }, { status: 400, headers: noStoreHeaders });
    if (!parsed.data.route.responseFormats.includes(parsed.data.dataset.defaultFormat)) return Response.json({ code: 400, message: "默认返回格式必须包含在已启用的返回格式中" }, { status: 400, headers: noStoreHeaders });
    if (parsed.data.dataset.menuValue && !parsed.data.dataset.categoryParameter) return Response.json({ code: 400, message: "启用分类列表触发值前需要填写分类参数名" }, { status: 400, headers: noStoreHeaders });
  }
  const routeConflict = await findRouteConflict({ publicHost: parsed.data.route.publicHost, publicPath: parsed.data.route.publicPath, routeVersion: parsed.data.route.routeVersion, methods: parsed.data.route.methods, excludeEndpointId: endpoint.id });
  if (routeConflict) return Response.json({ code: 409, message: `公开路由与“${routeConflict.version.product.name}”冲突` }, { status: 409, headers: noStoreHeaders });
  try {
    for (const node of parsed.data.upstream.nodes) await assertSafeUpstream(node.baseUrl, product.upstream.type as "PUBLIC_API" | "SERVER_LOCAL" | "TUNNEL");
  } catch (error) { return Response.json({ code: 400, message: `上游地址不允许：${error instanceof Error ? error.message : "INVALID_UPSTREAM"}` }, { status: 400, headers: noStoreHeaders }); }
  const secret = parsed.data.upstream.authType === "NONE" ? null : parsed.data.upstream.preserveSecret ? undefined : parsed.data.upstream.authType === "BEARER" ? { token: parsed.data.upstream.token } : { headerName: parsed.data.upstream.headerName, headerValue: parsed.data.upstream.headerValue };
  const currentExecution = product.executionConfig && typeof product.executionConfig === "object" && !Array.isArray(product.executionConfig) ? product.executionConfig as Record<string, unknown> : {};
  let phpEntryFile: string | undefined;
  if (product.internalHandler === phpHandlerId) {
    try { phpEntryFile = resolvePhpEntryFile(product.assets.map((asset) => asset.name), parsed.data.entryFile ?? String(currentExecution.entryFile ?? "")); }
    catch (error) { return Response.json({ code: 400, message: assetErrorMessage(error) ?? "PHP 入口文件无效" }, { status: 400, headers: noStoreHeaders }); }
  }
  const nextExecution = { ...currentExecution, ...(parsed.data.dataset ? { dataset: parsed.data.dataset } : {}), ...(phpEntryFile ? { entryFile: phpEntryFile } : {}) };
  const contentSample = isContentHandler(product.internalHandler) ? preparedContentResponseExample(product.internalHandler, product.assets, nextExecution, parsed.data.route.responseFormats) : undefined;
  if (parsed.data.dataset?.itemsPath && contentSample === undefined) return Response.json({ code: 400, message: `数据数组路径 ${parsed.data.dataset.itemsPath} 在当前文件中不存在或没有可用内容` }, { status: 400, headers: noStoreHeaders });
  const inferredContract = product.internalHandler === "content.dataset" && parsed.data.dataset?.contractMode === "AUTO" ? inferPreparedDatasetContract(product.assets, nextExecution) : null;
  const parameters = inferredContract?.parameters ?? parsed.data.parameters;
  const responseParameters = inferredContract?.responseParameters ?? parsed.data.responseParameters;
  const currentResponseContract = endpoint.responseParameters.map((parameter) => ({ name: parameter.name, dataType: parameter.dataType, description: parameter.description }));
  const responseContractChanged = JSON.stringify(currentResponseContract) !== JSON.stringify(responseParameters) || JSON.stringify(endpoint.responseFormats) !== JSON.stringify(parsed.data.route.responseFormats);
  const responseExample = isContentHandler(product.internalHandler)
    ? generateResponseExample(responseParameters, parsed.data.route.responseFormats, contentSample)
    : parsed.data.route.responseExample !== undefined
      ? parsed.data.route.responseExample
      : responseContractChanged
        ? generateResponseExample(responseParameters, parsed.data.route.responseFormats)
        : endpoint.responseExample ?? generateResponseExample(responseParameters, parsed.data.route.responseFormats);
  const responseExampleInput = responseExample === null ? Prisma.JsonNull : responseExample as Prisma.InputJsonValue;
  try {
    await prisma.$transaction(async (transaction) => {
      await transaction.apiProduct.update({ where: { id: product.id }, data: { status: "DRAFT", name: parsed.data.name, shortName: parsed.data.shortName, description: parsed.data.description, color: parsed.data.color, tags: parsed.data.tags, featured: auth.isAdmin ? parsed.data.featured : product.featured, sla: parsed.data.sla, categoryId: category.id, visibility: parsed.data.visibility, billingMode: parsed.data.billingMode, unitPrice: parsed.data.billingMode === "FREE" ? 0 : parsed.data.unitPrice, freeQuotaMonthly: parsed.data.freeQuotaMonthly, defaultQpsLimit: parsed.data.defaultQpsLimit, executionConfig: nextExecution as Prisma.InputJsonValue } });
      await transaction.apiVersion.update({ where: { id: product.versions[0].id }, data: { version: parsed.data.route.routeVersion, basePath: `${parsed.data.route.forceHttps ? "https" : "http"}://${parsed.data.route.publicHost}` } });
      await transaction.endpoint.update({ where: { id: endpoint.id }, data: { publicHost: parsed.data.route.publicHost, publicPath: parsed.data.route.publicPath, routeVersion: parsed.data.route.routeVersion, methods: parsed.data.route.methods, requestFormat: parsed.data.route.requestFormat, responseFormats: parsed.data.route.responseFormats, responseExample: responseExampleInput, summary: parsed.data.route.summary || parsed.data.name, corsEnabled: parsed.data.route.corsEnabled, forceHttps: parsed.data.route.forceHttps, requestLogging: parsed.data.route.requestLogging, dailyLimit: parsed.data.route.dailyLimit, ipAllowlist: parsed.data.route.ipAllowlist, ipDenylist: parsed.data.route.ipDenylist } });
      await transaction.apiUpstream.update({ where: { id: product.upstream!.id }, data: { rewriteMode: parsed.data.upstream.rewriteMode, upstreamPrefix: parsed.data.upstream.upstreamPrefix, healthPath: parsed.data.upstream.healthPath, timeoutMs: parsed.data.upstream.timeoutMs, authType: parsed.data.upstream.authType, healthStatus: "UNKNOWN", lastHealthError: null, ...(secret ? { secretConfigEncrypted: encryptJson(secret) } : secret === null ? { secretConfigEncrypted: null } : {}) } });
      await transaction.apiUpstreamNode.deleteMany({ where: { upstreamId: product.upstream!.id } });
      if (parsed.data.upstream.nodes.length) await transaction.apiUpstreamNode.createMany({ data: parsed.data.upstream.nodes.map((node) => ({ upstreamId: product.upstream!.id, name: node.name, baseUrl: node.baseUrl, weight: node.weight, enabled: node.enabled })) });
      await transaction.apiParameter.deleteMany({ where: { endpointId: endpoint.id } });
      if (parameters.length) await transaction.apiParameter.createMany({ data: parameters.map((parameter) => ({ endpointId: endpoint.id, location: parameter.location, name: parameter.name, upstreamName: parameter.upstreamName || null, required: parameter.required, dataType: parameter.dataType, defaultValue: parameter.defaultValue || null, description: parameter.description, validation: parameter.pattern ? { pattern: parameter.pattern } : {}, sensitive: parameter.sensitive })) });
      await transaction.apiResponseParameter.deleteMany({ where: { endpointId: endpoint.id } });
      if (responseParameters.length) await transaction.apiResponseParameter.createMany({ data: responseParameters.map((parameter, sortOrder) => ({ endpointId: endpoint.id, name: parameter.name, dataType: parameter.dataType, description: parameter.description, sortOrder })) });
      await transaction.auditLog.create({ data: { tenantId: auth.workspace?.tenantId, actorId: auth.user.id, action: "api.config.update", resource: "api-product", resourceId: product.id, metadata: { name: parsed.data.name, route: parsed.data.route.publicPath, nodes: parsed.data.upstream.nodes.length, parameters: parameters.length, contractMode: parsed.data.dataset?.contractMode, entryFile: phpEntryFile }, ipAddress: requestIp(request) } });
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
    const firstError = results.find((item) => !item.healthy)?.error;
    const failureMessage = firstError ? `所有上游节点均不可用：${firstError}` : "所有上游节点均不可用";
    await prisma.apiUpstream.update({ where: { id: product.upstream.id }, data: { healthStatus: healthyCount ? "HEALTHY" : "UNHEALTHY", lastHealthCheckAt: new Date(), lastHealthError: healthyCount ? null : failureMessage } });
    return Response.json({ code: healthyCount ? 200 : 503, message: healthyCount ? `${healthyCount} 个节点健康` : failureMessage, data: { healthy: Boolean(healthyCount), results } }, { status: healthyCount ? 200 : 503, headers: noStoreHeaders });
  }
  const clone = cloneSchema.safeParse(body);
  if (!clone.success) return Response.json({ code: 400, message: "操作参数不正确" }, { status: 400, headers: noStoreHeaders });
  const source = await managedProduct(clone.data.id, auth);
  const sourceEndpoint = source?.versions[0]?.endpoints[0];
  if (!source || !source.upstream || !sourceEndpoint) return Response.json({ code: 404, message: "源 API 不存在或无权访问" }, { status: 404, headers: noStoreHeaders });
  const routeConflict = await findRouteConflict({ publicHost: sourceEndpoint.publicHost, publicPath: clone.data.publicPath, routeVersion: sourceEndpoint.routeVersion, methods: sourceEndpoint.methods });
  if (routeConflict) return Response.json({ code: 409, message: `克隆路由与“${routeConflict.version.product.name}”冲突` }, { status: 409, headers: noStoreHeaders });
  try {
    await prisma.$transaction(async (transaction) => {
      const product = await transaction.apiProduct.create({ data: { providerId: source.providerId, categoryId: source.categoryId, slug: clone.data.slug, name: clone.data.name, shortName: Array.from(clone.data.name).slice(0, 4).join(""), description: source.description, color: source.color, tags: source.tags, featured: false, status: "DRAFT", visibility: source.visibility, sla: source.sla, internalHandler: source.internalHandler, executionConfig: source.executionConfig as Prisma.InputJsonValue, billingMode: source.billingMode, unitPrice: source.unitPrice, freeQuotaMonthly: source.freeQuotaMonthly, defaultQpsLimit: source.defaultQpsLimit } });
      const upstream = await transaction.apiUpstream.create({ data: { productId: product.id, type: source.upstream!.type, rewriteMode: source.upstream!.rewriteMode, upstreamPrefix: source.upstream!.upstreamPrefix, healthPath: source.upstream!.healthPath, timeoutMs: source.upstream!.timeoutMs, offlineOnFailure: source.upstream!.offlineOnFailure, authType: source.upstream!.authType, secretConfigEncrypted: source.upstream!.secretConfigEncrypted, allowPrivateNetwork: source.upstream!.allowPrivateNetwork } });
      if (source.upstream!.nodes.length) await transaction.apiUpstreamNode.createMany({ data: source.upstream!.nodes.map((node) => ({ upstreamId: upstream.id, name: node.name, baseUrl: node.baseUrl, weight: node.weight, enabled: node.enabled })) });
      const version = await transaction.apiVersion.create({ data: { productId: product.id, version: source.versions[0].version, basePath: source.versions[0].basePath } });
      const endpoint = await transaction.endpoint.create({ data: { versionId: version.id, methods: sourceEndpoint.methods, path: clone.data.publicPath, publicHost: sourceEndpoint.publicHost, publicPath: clone.data.publicPath, routeVersion: sourceEndpoint.routeVersion, requestFormat: sourceEndpoint.requestFormat, responseFormats: sourceEndpoint.responseFormats, ...(sourceEndpoint.responseExample === null ? {} : { responseExample: sourceEndpoint.responseExample as Prisma.InputJsonValue }), summary: clone.data.name, schema: sourceEndpoint.schema as Prisma.InputJsonValue, corsEnabled: sourceEndpoint.corsEnabled, forceHttps: sourceEndpoint.forceHttps, ipAllowlist: sourceEndpoint.ipAllowlist, ipDenylist: sourceEndpoint.ipDenylist, dailyLimit: sourceEndpoint.dailyLimit, requestLogging: sourceEndpoint.requestLogging } });
      if (sourceEndpoint.parameters.length) await transaction.apiParameter.createMany({ data: sourceEndpoint.parameters.map((item) => ({ endpointId: endpoint.id, location: item.location, name: item.name, upstreamName: item.upstreamName, required: item.required, dataType: item.dataType, defaultValue: item.defaultValue, description: item.description, validation: item.validation as Prisma.InputJsonValue, sensitive: item.sensitive })) });
      if (sourceEndpoint.responseParameters.length) await transaction.apiResponseParameter.createMany({ data: sourceEndpoint.responseParameters.map((item) => ({ endpointId: endpoint.id, name: item.name, dataType: item.dataType, description: item.description, sortOrder: item.sortOrder })) });
      const databaseAssets = source.assets.filter((asset) => !asset.storageKey);
      if (databaseAssets.length) await transaction.apiAsset.createMany({ data: databaseAssets.map((asset) => ({ productId: product.id, kind: asset.kind, name: asset.name, groupKey: asset.groupKey, mimeType: asset.mimeType, data: asset.data, size: asset.size })) });
      await transaction.auditLog.create({ data: { tenantId: auth.workspace?.tenantId, actorId: auth.user.id, action: "api.clone", resource: "api-product", resourceId: product.id, metadata: { sourceId: source.id, slug: clone.data.slug }, ipAddress: requestIp(request) } });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ code: 409, message: "新标识或公开路由已存在" }, { status: 409, headers: noStoreHeaders });
    return Response.json({ code: 500, message: "API 克隆失败" }, { status: 500, headers: noStoreHeaders });
  }
  revalidatePath("/", "layout");
  return Response.json({ code: 201, message: "API 已克隆为草稿", data: await getCatalogProduct(clone.data.slug, false) }, { status: 201, headers: noStoreHeaders });
}
