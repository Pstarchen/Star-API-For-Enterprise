import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { apiDataTypes, apiHttpMethods, apiParameterLocations, apiResponseFormats, generateResponseExample, normalizeMethods } from "@/lib/api-contracts";
import { apiSlugFromName, normalizePublicHost, normalizePublicPath, publicHostFromUrl } from "@/lib/api-routes";
import { internalHandlerTemplates, isAssetBackedHandler, phpHandlerId, type ContentHandlerId } from "@/lib/internal-handlers";
import { requireEnabledApiCategory } from "@/lib/server/api-categories";
import { getCurrentUser, getCurrentWorkspace } from "@/lib/server/auth";
import { assetErrorMessage, inferPreparedDatasetContract, MAX_TOTAL_ASSET_BYTES, prepareApiAssets, preparedContentResponseExample, preparePhpPackage, type PreparedAsset } from "@/lib/server/api-assets";
import { getCatalogProduct } from "@/lib/server/catalog";
import { encryptJson } from "@/lib/server/encryption";
import { getPlatformConfig } from "@/lib/server/installation";
import { removeStoredMedia } from "@/lib/server/media-storage";
import { findRouteConflict, findSlugConflict } from "@/lib/server/api-routing";
import { prisma } from "@/lib/server/prisma";
import { noStoreHeaders, readLimitedFormData, requestIp } from "@/lib/server/request";
import { assertSafeUpstream, checkUpstreamHealth } from "@/lib/server/upstream";

const handlerIds = internalHandlerTemplates.map((item) => item.id) as [string, ...string[]];
const sourceTypes = ["RANDOM_IMAGE", "RANDOM_VIDEO", "RANDOM_TEXT", "STATIC_JSON", "DATASET", "PHP_PACKAGE", "EXTERNAL", "SERVER_LOCAL", "TUNNEL", "BUILTIN"] as const;

const optionalText = (maximum: number) => z.string().trim().max(maximum).optional().default("");
const createSchema = z.object({
  sourceType: z.enum(sourceTypes),
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "标识仅支持小写字母、数字和连字符"),
  shortName: optionalText(4),
  description: optionalText(1000),
  categoryId: z.string().min(1, "请选择 API 分类"),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).default("#586be8"),
  tags: z.array(z.string().trim().min(1).max(24)).max(10).default([]),
  featured: z.boolean().default(false),
  providerName: optionalText(100),
  providerLegalName: optionalText(160),
  providerEmail: z.union([z.email(), z.literal("")]).optional().default(""),
  version: z.string().trim().max(24).regex(/^[A-Za-z0-9._-]*$/).optional().default("v1"),
  publicHost: z.string().trim().toLowerCase().min(1).max(253).regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/, "对外域名格式不正确").transform(normalizePublicHost),
  publicPath: z.string().trim().max(180).regex(/^\/(?:[A-Za-z0-9._~!$&'()*+,;=:@%{}-]+\/?)*$/, "公开路径必须以 / 开头且不能包含查询参数").transform(normalizePublicPath),
  visibility: z.enum(["PUBLIC", "PRIVATE", "GRAY", "INTERNAL"]).default("PUBLIC"),
  methods: z.array(z.enum(apiHttpMethods)).min(1).max(apiHttpMethods.length).transform(normalizeMethods).default(["GET"]),
  path: z.string().trim().max(180).regex(/^\/(?:[A-Za-z0-9._~!$&'()*+,;=:@%{}-]+\/?)*$/, "路径必须以 / 开头且不能包含查询参数").transform(normalizePublicPath).optional().default("/"),
  requestFormat: z.enum(["JSON", "FORM", "BINARY", "ANY"]).default("JSON"),
  summary: optionalText(160),
  internalHandler: z.enum(handlerIds).optional(),
  upstreamBaseUrl: z.union([z.url(), z.literal("")]).optional().default(""),
  upstreamAuthType: z.enum(["NONE", "BEARER", "HEADER"]).default("NONE"),
  upstreamToken: z.string().max(4000).optional().default(""),
  upstreamHeaderName: optionalText(80),
  upstreamHeaderValue: z.string().max(4000).optional().default(""),
  allowPrivateNetwork: z.boolean().default(false),
  rewriteMode: z.enum(["PASSTHROUGH", "PREFIX", "EXACT"]).default("PASSTHROUGH"),
  upstreamPrefix: optionalText(180),
  healthPath: z.string().trim().max(180).regex(/^\/(?:[A-Za-z0-9._~!$&'()*+,;=:@%-]+\/?)*$/).default("/"),
  timeoutMs: z.coerce.number().int().min(500).max(60000).default(10000),
  corsEnabled: z.boolean().default(false),
  forceHttps: z.boolean().default(true),
  requestLogging: z.boolean().default(true),
  dailyLimit: z.coerce.number().int().min(0).max(1_000_000_000).default(0),
  ipAllowlist: z.array(z.string().trim().min(1).max(64)).max(200).default([]),
  ipDenylist: z.array(z.string().trim().min(1).max(64)).max(200).default([]),
  billingMode: z.enum(["FREE", "PER_REQUEST"]).default("FREE"),
  unitPrice: z.coerce.number().min(0).max(100000).default(0),
  freeQuotaMonthly: z.coerce.number().int().min(0).max(1_000_000_000).default(0),
  defaultQpsLimit: z.coerce.number().int().min(1).max(100000).default(10),
  sla: z.coerce.number().min(0).max(100).default(99.9),
  content: z.string().max(2_000_000).optional().default(""),
  entryFile: optionalText(180),
  parameters: z.array(z.object({ location: z.enum(apiParameterLocations), name: z.string().trim().min(1).max(80), upstreamName: optionalText(160), required: z.boolean(), dataType: z.enum(apiDataTypes), defaultValue: optionalText(500), description: optionalText(1000), pattern: optionalText(300), sensitive: z.boolean() }).strict()).max(200).default([]),
  responseParameters: z.array(z.object({ name: z.string().trim().min(1).max(120), dataType: z.enum(apiDataTypes), description: optionalText(1000) }).strict()).max(200).default([]),
  responseFormats: z.array(z.enum(apiResponseFormats)).min(1).max(apiResponseFormats.length).default(["JSON"]),
  dataset: z.object({ grouping: z.enum(["FILE", "MERGED"]).default("MERGED"), contractMode: z.enum(["AUTO", "MANUAL"]).optional(), categoryParameter: optionalText(80), formatParameter: optionalText(80), menuValue: optionalText(80), defaultFormat: z.enum(["TXT", "JSON"]).default("JSON"), textField: optionalText(160), itemsPath: optionalText(160) }).strict().optional(),
}).strict().superRefine((value, context) => {
  if (value.sourceType === "BUILTIN") {
    const template = internalHandlerTemplates.find((item) => item.id === value.internalHandler);
    if (!template) context.addIssue({ code: "custom", path: ["internalHandler"], message: "请选择内置工具" });
    else if (value.methods.some((method) => method === "ALL" || !(template.methods as readonly string[]).includes(method))) context.addIssue({ code: "custom", path: ["methods"], message: "该工具不支持所选请求方法" });
  }
  if (["EXTERNAL", "SERVER_LOCAL", "TUNNEL"].includes(value.sourceType) && !value.upstreamBaseUrl) context.addIssue({ code: "custom", path: ["upstreamBaseUrl"], message: "请填写上游服务地址" });
  if (value.sourceType !== "PHP_PACKAGE" && value.methods.includes("ALL")) context.addIssue({ code: "custom", path: ["methods"], message: "仅 PHP 程序包支持全部请求方法" });
  if (["EXTERNAL", "SERVER_LOCAL", "TUNNEL"].includes(value.sourceType) && value.upstreamAuthType === "BEARER" && !value.upstreamToken) context.addIssue({ code: "custom", path: ["upstreamToken"], message: "请填写 Bearer Token" });
  if (["EXTERNAL", "SERVER_LOCAL", "TUNNEL"].includes(value.sourceType) && value.upstreamAuthType === "HEADER" && (!value.upstreamHeaderName || !value.upstreamHeaderValue)) context.addIssue({ code: "custom", path: ["upstreamHeaderName"], message: "请填写鉴权请求头名称和值" });
  if (value.rewriteMode === "PREFIX" && !value.upstreamPrefix) context.addIssue({ code: "custom", path: ["upstreamPrefix"], message: "前缀重写需要填写上游路径前缀" });
  if (value.billingMode === "PER_REQUEST" && value.unitPrice <= 0) context.addIssue({ code: "custom", path: ["unitPrice"], message: "收费 API 的单价必须大于 0" });
  if (value.sourceType === "DATASET") {
    if (value.responseFormats.some((format) => format === "BINARY")) context.addIssue({ code: "custom", path: ["responseFormats"], message: "通用数据源仅支持 TXT 和 JSON 响应" });
    const defaultFormat = value.dataset?.defaultFormat ?? (value.responseFormats.includes("JSON") ? "JSON" : "TXT");
    if (!value.responseFormats.includes(defaultFormat)) context.addIssue({ code: "custom", path: ["dataset", "defaultFormat"], message: "默认返回格式必须包含在已启用的返回格式中" });
    if (value.dataset?.menuValue && !value.dataset.categoryParameter) context.addIssue({ code: "custom", path: ["dataset", "menuValue"], message: "启用分类列表触发值前需要填写分类参数名" });
  }
});

const statusSchema = z.object({ id: z.string().min(1), status: z.enum(["DRAFT", "REVIEW", "GRAY", "PUBLISHED", "DEPRECATED", "OFFLINE"]) }).strict();

async function admin() {
  const user = await getCurrentUser();
  if (!user) return { error: Response.json({ code: 401, message: "请先登录" }, { status: 401, headers: noStoreHeaders }) } as const;
  if (user.platformRole === "ADMIN") return { user, workspace: await getCurrentWorkspace(user), isAdmin: true } as const;
  const workspace = await getCurrentWorkspace(user);
  if (!workspace || workspace.tenant.type !== "ENTERPRISE" || !["OWNER", "ADMIN"].includes(workspace.role)) return { error: Response.json({ code: 403, message: "仅平台管理员或企业服务商管理员可以管理 API" }, { status: 403, headers: noStoreHeaders }) } as const;
  return { user, workspace, isAdmin: false } as const;
}

function contentHandler(sourceType: typeof sourceTypes[number]): ContentHandlerId | null {
  if (sourceType === "RANDOM_IMAGE") return "content.random-image";
  if (sourceType === "RANDOM_VIDEO") return "content.random-video";
  if (sourceType === "RANDOM_TEXT") return "content.random-text";
  if (sourceType === "STATIC_JSON") return "content.static-json";
  if (sourceType === "DATASET") return "content.dataset";
  return null;
}

function endpointSchema(sourceType: typeof sourceTypes[number]) {
  if (sourceType === "RANDOM_IMAGE") return { type: "string", format: "binary", contentType: "image/*" };
  if (sourceType === "RANDOM_VIDEO") return { type: "string", format: "binary", contentType: "video/*", supportsRanges: true };
  if (sourceType === "RANDOM_TEXT") return { type: "string", contentType: "text/plain; charset=utf-8" };
  if (sourceType === "STATIC_JSON") return { type: "object", contentType: "application/json; charset=utf-8" };
  if (sourceType === "DATASET") return { type: "object", contentType: ["text/plain; charset=utf-8", "application/json; charset=utf-8"], description: "通用数据源随机响应" };
  if (sourceType === "PHP_PACKAGE") return { type: "object", description: "PHP 程序包动态响应" };
  return { type: "object", properties: {} };
}

async function generatedSlug(name: string) {
  const base = apiSlugFromName(name);
  if (!await findSlugConflict(base)) return base;
  for (let suffix = 2; suffix <= 999; suffix += 1) {
    const candidate = `${base.slice(0, 76 - String(suffix).length)}-${suffix}`;
    if (!await findSlugConflict(candidate)) return candidate;
  }
  return `${base.slice(0, 71)}-${crypto.randomUUID().slice(0, 8)}`;
}

async function requestInput(request: Request) {
  if (!request.headers.get("content-type")?.includes("multipart/form-data")) throw new Error("MULTIPART_REQUIRED");
  const form = await readLimitedFormData(request, MAX_TOTAL_ASSET_BYTES + 6 * 1024 * 1024);
  const raw = form.get("config");
  const decoded = typeof raw === "string" ? JSON.parse(raw) : null;
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) throw new Error("INVALID_CONFIG");
  const supplied = decoded as Record<string, unknown>;
  const name = typeof supplied.name === "string" ? supplied.name.trim() : "";
  const hasExplicitSlug = typeof supplied.slug === "string" && supplied.slug.trim().length > 0;
  const slug = hasExplicitSlug ? String(supplied.slug).trim() : await generatedSlug(name);
  const platform = await getPlatformConfig();
  const publicPath = normalizePublicPath(typeof supplied.publicPath === "string" && supplied.publicPath.trim() ? supplied.publicPath : `/api/${slug}`);
  const config = {
    publicHost: publicHostFromUrl(platform.publicUrl, process.env.API_PUBLIC_HOST ?? "localhost"),
    version: "v1",
    visibility: "PUBLIC",
    methods: supplied.sourceType === "DATASET" ? ["GET", "POST"] : ["GET"],
    requestFormat: "JSON",
    corsEnabled: true,
    forceHttps: platform.publicUrl.startsWith("https://"),
    requestLogging: true,
    billingMode: "FREE",
    defaultQpsLimit: 10,
    ...supplied,
    name,
    slug,
    publicPath,
    path: typeof supplied.path === "string" && supplied.path.trim() ? normalizePublicPath(supplied.path) : `/${slug}`,
  };
  const parsed = createSchema.safeParse(config);
  const files = form.getAll("assets").filter((item): item is File => item instanceof File && item.size > 0);
  return { parsed, files };
}

export async function POST(request: Request) {
  const auth = await admin();
  if ("error" in auth) return auth.error;
  let payload: Awaited<ReturnType<typeof requestInput>>;
  try { payload = await requestInput(request); } catch { return Response.json({ code: 400, message: "API 创建请求格式不正确" }, { status: 400, headers: noStoreHeaders }); }
  if (!payload.parsed.success) return Response.json({ code: 400, message: "请检查标红的 API 配置", details: z.flattenError(payload.parsed.error) }, { status: 400, headers: noStoreHeaders });
  const input = payload.parsed.data;
  if (!auth.isAdmin && ["SERVER_LOCAL", "PHP_PACKAGE"].includes(input.sourceType)) return Response.json({ code: 403, message: input.sourceType === "PHP_PACKAGE" ? "PHP 程序包仅平台管理员可以部署；服务商请使用公网 API 接入" : "服务器内网服务仅平台管理员可以配置；服务商可使用公网或临时穿透上游" }, { status: 403, headers: noStoreHeaders });
  const handler = contentHandler(input.sourceType);
  const effectiveMethods = input.methods;
  const [slugConflict, routeConflict] = await Promise.all([
    findSlugConflict(input.slug),
    findRouteConflict({ publicHost: input.publicHost, publicPath: input.publicPath, routeVersion: input.version || "v1", methods: effectiveMethods }),
  ]);
  if (slugConflict) return Response.json({ code: 409, message: `API 唯一标识已被“${slugConflict.name}”使用` }, { status: 409, headers: noStoreHeaders });
  if (routeConflict) return Response.json({ code: 409, message: `公开路由与“${routeConflict.version.product.name}”冲突` }, { status: 409, headers: noStoreHeaders });
  if (["EXTERNAL", "SERVER_LOCAL", "TUNNEL"].includes(input.sourceType)) {
    const kind = input.sourceType === "EXTERNAL" ? "PUBLIC_API" : input.sourceType as "SERVER_LOCAL" | "TUNNEL";
    try {
      await assertSafeUpstream(input.upstreamBaseUrl, kind);
    } catch (error) {
      return Response.json({ code: 400, message: `上游地址不允许：${error instanceof Error ? error.message : "INVALID_UPSTREAM"}` }, { status: 400, headers: noStoreHeaders });
    }
  }
  let assets: PreparedAsset[] = [];
  let phpEntryFile = input.entryFile;
  try {
    if (handler && handler !== "content.random-video" && (handler !== "content.random-image" || payload.files.length)) assets = await prepareApiAssets(handler, { files: payload.files, content: input.content });
    if (input.sourceType === "PHP_PACKAGE") {
      const prepared = await preparePhpPackage(payload.files[0], phpEntryFile);
      assets = prepared.assets;
      phpEntryFile = prepared.entryFile;
    }
  }
  catch (error) { return Response.json({ code: 400, message: assetErrorMessage(error) ?? "上传内容无法处理" }, { status: 400, headers: noStoreHeaders }); }

  const platform = await getPlatformConfig();
  const category = await requireEnabledApiCategory(input.categoryId);
  if (!category) return Response.json({ code: 400, message: "所选 API 分类不存在或已停用" }, { status: 400, headers: noStoreHeaders });
  const providerName = input.providerName || platform.name;
  const providerLegalName = input.providerLegalName || providerName;
  const providerEmail = input.providerEmail || auth.user.email;
  const selectedHandler = handler ?? (input.sourceType === "PHP_PACKAGE" ? phpHandlerId : input.sourceType === "BUILTIN" ? input.internalHandler : null);
  const methods = effectiveMethods;
  const version = input.version || "v1";
  const shortName = input.shortName || Array.from(input.name).slice(0, 4).join("");
  const networkSource = ["EXTERNAL", "SERVER_LOCAL", "TUNNEL"].includes(input.sourceType);
  const upstreamType = input.sourceType === "EXTERNAL" ? "PUBLIC_API" : input.sourceType === "SERVER_LOCAL" ? "SERVER_LOCAL" : input.sourceType === "TUNNEL" ? "TUNNEL" : input.sourceType === "PHP_PACKAGE" ? "PHP_PACKAGE" : input.sourceType === "BUILTIN" ? "BUILTIN" : "CONTENT";
  const datasetConfig = input.sourceType === "DATASET" ? {
    ...(input.dataset ?? { grouping: "FILE", categoryParameter: "category", formatParameter: "format", menuValue: "list", defaultFormat: input.responseFormats.includes("JSON") ? "JSON" : "TXT", textField: "", itemsPath: "" }),
    contractMode: input.dataset?.contractMode ?? (input.parameters.length || input.responseParameters.length ? "MANUAL" : "AUTO"),
  } : null;
  const executionConfig = { sourceType: input.sourceType, ...(input.sourceType === "PHP_PACKAGE" ? { entryFile: phpEntryFile } : {}), ...(datasetConfig ? { dataset: datasetConfig } : {}) };
  const contentSample = handler ? preparedContentResponseExample(handler, assets, executionConfig, input.responseFormats) : undefined;
  if (input.sourceType === "DATASET" && input.dataset?.itemsPath && contentSample === undefined) return Response.json({ code: 400, message: `数据数组路径 ${input.dataset.itemsPath} 在已上传文件中不存在或没有可用内容` }, { status: 400, headers: noStoreHeaders });
  const inferredContract = input.sourceType === "DATASET" ? inferPreparedDatasetContract(assets, executionConfig) : null;
  const parameters = input.parameters.length ? input.parameters : inferredContract?.parameters ?? [];
  const responseParameters = input.responseParameters.length ? input.responseParameters : inferredContract?.responseParameters ?? [];
  const responseExample = generateResponseExample(responseParameters, input.responseFormats, contentSample);
  const secretConfig = networkSource && input.upstreamAuthType === "BEARER"
    ? { token: input.upstreamToken }
    : networkSource && input.upstreamAuthType === "HEADER" ? { headerName: input.upstreamHeaderName, headerValue: input.upstreamHeaderValue } : {};

  try {
    await prisma.$transaction(async (transaction) => {
      let provider = auth.isAdmin
        ? await transaction.provider.findFirst({ where: { name: providerName } })
        : await transaction.provider.findFirst({ where: { ownerTenantId: auth.workspace.tenantId } });
      if (!provider) provider = await transaction.provider.create({ data: { ownerTenantId: auth.isAdmin ? null : auth.workspace.tenantId, name: auth.isAdmin ? providerName : auth.workspace.tenant.name, legalName: auth.isAdmin ? providerLegalName : input.providerLegalName || auth.workspace.tenant.name, contactEmail: providerEmail } });
      const product = await transaction.apiProduct.create({
        data: {
          providerId: provider.id,
          slug: input.slug,
          name: input.name,
          shortName,
          description: input.description || `${input.name} API`,
          categoryId: category.id,
          color: input.color,
          tags: input.tags,
          featured: auth.isAdmin && input.featured,
          visibility: input.visibility,
          sla: input.sla,
          internalHandler: selectedHandler,
          executionConfig,
          billingMode: input.billingMode,
          unitPrice: input.billingMode === "FREE" ? 0 : input.unitPrice,
          freeQuotaMonthly: input.freeQuotaMonthly,
          defaultQpsLimit: input.defaultQpsLimit,
          upstream: { create: { type: upstreamType, rewriteMode: input.rewriteMode, upstreamPrefix: input.upstreamPrefix, healthPath: input.healthPath, timeoutMs: input.timeoutMs, authType: networkSource ? input.upstreamAuthType : "NONE", secretConfigEncrypted: Object.keys(secretConfig).length ? encryptJson(secretConfig) : null, allowPrivateNetwork: input.sourceType === "SERVER_LOCAL", nodes: networkSource ? { create: { name: "主节点", baseUrl: input.upstreamBaseUrl, weight: 100 } } : undefined } },
          assets: assets.length ? { create: assets.map((asset) => ({ ...asset, size: BigInt(asset.size) })) } : undefined,
          versions: {
            create: {
              version,
              basePath: `${input.forceHttps ? "https" : "http"}://${input.publicHost}`,
              endpoints: {
                create: {
                  methods,
                  path: input.path,
                  publicHost: input.publicHost,
                  publicPath: input.publicPath,
                  routeVersion: version,
                  requestFormat: input.requestFormat,
                  responseFormats: input.responseFormats,
                  responseExample: responseExample as Prisma.InputJsonValue,
                  summary: input.summary || input.name,
                  schema: endpointSchema(input.sourceType),
                  corsEnabled: input.corsEnabled,
                  forceHttps: input.forceHttps,
                  requestLogging: input.requestLogging,
                  dailyLimit: input.dailyLimit,
                  ipAllowlist: input.ipAllowlist,
                  ipDenylist: input.ipDenylist,
                  parameters: parameters.length ? { create: parameters.map((parameter) => ({ location: parameter.location, name: parameter.name, upstreamName: parameter.upstreamName || null, required: parameter.required, dataType: parameter.dataType, defaultValue: parameter.defaultValue || null, description: parameter.description, validation: parameter.pattern ? { pattern: parameter.pattern } : {}, sensitive: parameter.sensitive })) } : undefined,
                  responseParameters: responseParameters.length ? { create: responseParameters.map((parameter, sortOrder) => ({ ...parameter, sortOrder })) } : undefined,
                },
              },
            },
          },
        },
      });
      await transaction.auditLog.create({ data: { tenantId: auth.workspace?.tenantId, actorId: auth.user.id, action: "api.create", resource: "api-product", resourceId: product.id, metadata: { slug: input.slug, sourceType: input.sourceType, billingMode: input.billingMode, assets: assets.length }, ipAddress: requestIp(request) } });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ code: 409, message: "API 唯一标识已存在" }, { status: 409, headers: noStoreHeaders });
    return Response.json({ code: 500, message: "API 创建失败，请稍后重试" }, { status: 500, headers: noStoreHeaders });
  }
  revalidatePath("/", "layout");
  return Response.json({ code: 201, message: "API 草稿已创建", data: await getCatalogProduct(input.slug, false) }, { status: 201, headers: noStoreHeaders });
}

export async function PATCH(request: Request) {
  const auth = await admin();
  if ("error" in auth) return auth.error;
  const parsed = statusSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: 400, message: "状态参数不正确" }, { status: 400, headers: noStoreHeaders });
  const existing = await prisma.apiProduct.findUnique({ where: { id: parsed.data.id }, include: { provider: true, upstream: { include: { nodes: true } }, versions: { include: { endpoints: true } }, _count: { select: { assets: true } } } });
  if (!existing) return Response.json({ code: 404, message: "API 不存在" }, { status: 404, headers: noStoreHeaders });
  if (!auth.isAdmin && existing.provider.ownerTenantId !== auth.workspace.tenantId) return Response.json({ code: 403, message: "无权管理其他服务商的 API" }, { status: 403, headers: noStoreHeaders });
  if (!auth.isAdmin && !["DRAFT", "REVIEW", "OFFLINE"].includes(parsed.data.status)) return Response.json({ code: 403, message: "服务商只能保存草稿、提交审核或下线维护" }, { status: 403, headers: noStoreHeaders });
  if (parsed.data.status === "PUBLISHED" && !existing.versions.some((version) => version.endpoints.length)) return Response.json({ code: 409, message: "API 没有可发布的端点" }, { status: 409, headers: noStoreHeaders });
  if (parsed.data.status === "PUBLISHED" && isAssetBackedHandler(existing.internalHandler) && !existing._count.assets) return Response.json({ code: 409, message: "请先为该 API 添加可执行或可返回的内容" }, { status: 409, headers: noStoreHeaders });
  if (["PUBLISHED", "GRAY"].includes(parsed.data.status) && existing.upstream && ["PUBLIC_API", "SERVER_LOCAL", "TUNNEL"].includes(existing.upstream.type)) {
    let healthy = false;
    let lastError = "上游健康检查失败";
    for (const node of existing.upstream.nodes.filter((item) => item.enabled)) {
      try {
        await checkUpstreamHealth({ baseUrl: node.baseUrl, healthPath: existing.upstream.healthPath, timeoutMs: existing.upstream.timeoutMs, kind: existing.upstream.type as "PUBLIC_API" | "SERVER_LOCAL" | "TUNNEL" });
        await prisma.apiUpstreamNode.update({ where: { id: node.id }, data: { healthStatus: "HEALTHY", failureCount: 0, lastCheckedAt: new Date(), lastError: null } });
        healthy = true;
      } catch (error) {
        lastError = error instanceof Error ? error.message : "HEALTH_CHECK_FAILED";
        await prisma.apiUpstreamNode.update({ where: { id: node.id }, data: { healthStatus: "UNHEALTHY", failureCount: { increment: 1 }, lastCheckedAt: new Date(), lastError } });
      }
    }
    await prisma.apiUpstream.update({ where: { id: existing.upstream.id }, data: { healthStatus: healthy ? "HEALTHY" : "UNHEALTHY", lastHealthCheckAt: new Date(), lastHealthError: healthy ? null : lastError } });
    if (!healthy) return Response.json({ code: 409, message: `健康检查未通过：${lastError}` }, { status: 409, headers: noStoreHeaders });
  }
  const auditDecision = parsed.data.status === "REVIEW" ? "SUBMITTED" : ["PUBLISHED", "GRAY"].includes(parsed.data.status) ? "APPROVED" : existing.status === "REVIEW" && parsed.data.status === "DRAFT" ? "REJECTED" : null;
  await prisma.$transaction([
    prisma.apiProduct.update({ where: { id: existing.id }, data: { status: parsed.data.status } }),
    ...(auditDecision ? [prisma.apiAudit.create({ data: { productId: existing.id, reviewerId: auditDecision === "SUBMITTED" ? null : auth.user.id, decision: auditDecision, note: parsed.data.status === "GRAY" ? "管理员批准灰度发布" : auditDecision === "REJECTED" ? "管理员退回草稿修改" : null } })] : []),
    prisma.auditLog.create({ data: { tenantId: auth.workspace?.tenantId, actorId: auth.user.id, action: "api.status.update", resource: "api-product", resourceId: existing.id, metadata: { previous: existing.status, next: parsed.data.status }, ipAddress: requestIp(request) } }),
  ]);
  revalidatePath("/", "layout");
  return Response.json({ code: 200, message: "API 状态已更新", data: await getCatalogProduct(existing.slug, false) }, { headers: noStoreHeaders });
}

export async function DELETE(request: Request) {
  const auth = await admin();
  if ("error" in auth) return auth.error;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ code: 400, message: "缺少 API ID" }, { status: 400, headers: noStoreHeaders });
  const existing = await prisma.apiProduct.findUnique({ where: { id }, include: { provider: true, assets: { where: { storageKey: { not: null } }, select: { storageKey: true } }, _count: { select: { subscriptions: true } } } });
  if (!existing) return Response.json({ code: 404, message: "API 不存在" }, { status: 404, headers: noStoreHeaders });
  if (!auth.isAdmin && existing.provider.ownerTenantId !== auth.workspace.tenantId) return Response.json({ code: 403, message: "无权删除其他服务商的 API" }, { status: 403, headers: noStoreHeaders });
  if (!["DRAFT", "OFFLINE"].includes(existing.status)) return Response.json({ code: 409, message: "请先将 API 下线，再执行删除" }, { status: 409, headers: noStoreHeaders });
  await prisma.$transaction([
    prisma.subscription.deleteMany({ where: { productId: id } }),
    prisma.apiProduct.delete({ where: { id } }),
    prisma.auditLog.create({ data: { tenantId: auth.workspace?.tenantId, actorId: auth.user.id, action: "api.delete", resource: "api-product", resourceId: id, metadata: { slug: existing.slug, cancelledSubscriptions: existing._count.subscriptions }, ipAddress: requestIp(request) } }),
  ]);
  await Promise.all(existing.assets.map((asset) => removeStoredMedia(asset.storageKey).catch(() => undefined)));
  revalidatePath("/", "layout");
  return Response.json({ code: 200, message: existing._count.subscriptions ? `API 已删除，同时取消 ${existing._count.subscriptions} 个应用订阅` : "API 已删除" }, { headers: noStoreHeaders });
}
