import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { getCurrentUser, getCurrentWorkspace } from "@/lib/server/auth";
import { getCatalogProduct } from "@/lib/server/catalog";
import { prisma } from "@/lib/server/prisma";
import { noStoreHeaders, requestIp } from "@/lib/server/request";
import { assertSafeUpstream } from "@/lib/server/upstream";

const configSchema = z.object({ name: z.string().trim().min(2).max(80), slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), categoryId: z.string().min(1), publicHost: z.string().trim().toLowerCase().min(1).max(253), publicPrefix: z.string().trim().regex(/^\/(?:[A-Za-z0-9._~!$&'()*+,;=:@%-]+\/?)*$/), upstreamOverride: z.union([z.url(), z.literal("")]).default(""), visibility: z.enum(["PUBLIC", "PRIVATE", "GRAY", "INTERNAL"]).default("PUBLIC"), billingMode: z.enum(["FREE", "PER_REQUEST"]).default("FREE"), unitPrice: z.coerce.number().min(0).max(100000).default(0), defaultQpsLimit: z.coerce.number().int().min(1).max(100000).default(10) }).strict();
const supportedMethods = ["get", "post", "put", "patch", "delete"] as const;
type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {}; }
function text(value: unknown, fallback = "") { return typeof value === "string" ? value : fallback; }
function combinePath(prefix: string, path: string) { const joined = `${prefix === "/" ? "" : prefix}/${path}`.replace(/\/{2,}/g, "/"); return joined.startsWith("/") ? joined : `/${joined}`; }
function versionValue(document: JsonObject) { const value = text(object(document.info).version, "v1").replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 24); return value || "v1"; }

async function editor() {
  const user = await getCurrentUser();
  if (!user) return { error: Response.json({ code: 401, message: "请先登录" }, { status: 401, headers: noStoreHeaders }) } as const;
  if (user.platformRole === "ADMIN") return { user, workspace: await getCurrentWorkspace(user), isAdmin: true } as const;
  const workspace = await getCurrentWorkspace(user);
  if (!workspace || workspace.tenant.type !== "ENTERPRISE" || !["OWNER", "ADMIN"].includes(workspace.role)) return { error: Response.json({ code: 403, message: "当前账号没有 OpenAPI 导入权限" }, { status: 403, headers: noStoreHeaders }) } as const;
  return { user, workspace, isAdmin: false } as const;
}

export async function POST(request: Request) {
  const auth = await editor();
  if ("error" in auth) return auth.error;
  const form = await request.formData().catch(() => null);
  if (!form) return Response.json({ code: 400, message: "导入请求格式不正确" }, { status: 400, headers: noStoreHeaders });
  const file = form.get("document");
  const rawConfig = form.get("config");
  if (!(file instanceof File) || !file.size || file.size > 2 * 1024 * 1024) return Response.json({ code: 400, message: "请选择不超过 2 MB 的 OpenAPI JSON/YAML 文件" }, { status: 400, headers: noStoreHeaders });
  const config = configSchema.safeParse(typeof rawConfig === "string" ? JSON.parse(rawConfig) : null);
  if (!config.success) return Response.json({ code: 400, message: "导入配置不正确", details: z.flattenError(config.error) }, { status: 400, headers: noStoreHeaders });
  const category = await prisma.apiCategory.findFirst({ where: { id: config.data.categoryId, enabled: true } });
  if (!category) return Response.json({ code: 400, message: "所选 API 分类不存在或已停用" }, { status: 400, headers: noStoreHeaders });
  let document: JsonObject;
  try { document = object(parseYaml(await file.text())); } catch { return Response.json({ code: 400, message: "OpenAPI 文件不是有效的 JSON 或 YAML" }, { status: 400, headers: noStoreHeaders }); }
  if (!text(document.openapi).startsWith("3.")) return Response.json({ code: 400, message: "当前仅支持 OpenAPI 3.x 文档" }, { status: 400, headers: noStoreHeaders });
  const paths = object(document.paths);
  const operations = Object.entries(paths).flatMap(([path, rawPath]) => {
    const pathItem = object(rawPath);
    const sharedParameters = Array.isArray(pathItem.parameters) ? pathItem.parameters : [];
    return supportedMethods.flatMap((method) => pathItem[method] ? [{ path, method: method.toUpperCase(), operation: object(pathItem[method]), parameters: [...sharedParameters, ...(Array.isArray(object(pathItem[method]).parameters) ? object(pathItem[method]).parameters as unknown[] : [])] }] : []);
  });
  if (!operations.length) return Response.json({ code: 400, message: "OpenAPI 文档中没有可导入的 HTTP 端点" }, { status: 400, headers: noStoreHeaders });
  if (operations.length > 100) return Response.json({ code: 400, message: "单次最多导入 100 个端点" }, { status: 400, headers: noStoreHeaders });
  const firstServer = Array.isArray(document.servers) ? object(document.servers[0]) : {};
  const upstreamUrl = config.data.upstreamOverride || text(firstServer.url);
  if (!upstreamUrl) return Response.json({ code: 400, message: "文档缺少 servers[0].url，请填写上游覆盖地址" }, { status: 400, headers: noStoreHeaders });
  let upstream: URL;
  try { upstream = await assertSafeUpstream(upstreamUrl, "PUBLIC_API"); } catch (error) { return Response.json({ code: 400, message: `上游地址不允许：${error instanceof Error ? error.message : "INVALID_UPSTREAM"}` }, { status: 400, headers: noStoreHeaders }); }
  const version = versionValue(document);
  const info = object(document.info);
  try {
    await prisma.$transaction(async (transaction) => {
      let provider = auth.isAdmin ? await transaction.provider.findFirst({ where: { name: text(info["x-provider"], config.data.name) } }) : await transaction.provider.findFirst({ where: { ownerTenantId: auth.workspace.tenantId } });
      if (!provider) provider = await transaction.provider.create({ data: { ownerTenantId: auth.isAdmin ? null : auth.workspace.tenantId, name: auth.isAdmin ? text(info["x-provider"], config.data.name) : auth.workspace.tenant.name, legalName: auth.isAdmin ? text(info["x-provider"], config.data.name) : auth.workspace.tenant.name, contactEmail: auth.user.email } });
      const product = await transaction.apiProduct.create({ data: { providerId: provider.id, categoryId: category.id, slug: config.data.slug, name: config.data.name, shortName: Array.from(config.data.name).slice(0, 4).join(""), description: text(info.description, `${config.data.name} OpenAPI 服务`), color: "#586be8", tags: ["OpenAPI"], featured: false, status: "DRAFT", visibility: config.data.visibility, sla: 99.9, executionConfig: { sourceType: "OPENAPI_IMPORT" }, billingMode: config.data.billingMode, unitPrice: config.data.billingMode === "FREE" ? 0 : config.data.unitPrice, defaultQpsLimit: config.data.defaultQpsLimit } });
      const apiUpstream = await transaction.apiUpstream.create({ data: { productId: product.id, type: "PUBLIC_API", rewriteMode: upstream.pathname && upstream.pathname !== "/" ? "PREFIX" : "PASSTHROUGH", upstreamPrefix: upstream.pathname === "/" ? "" : upstream.pathname.replace(/\/$/, ""), healthPath: "/", timeoutMs: 10000, authType: "NONE", nodes: { create: { name: "OpenAPI 主节点", baseUrl: upstream.origin, weight: 100 } } } });
      const apiVersion = await transaction.apiVersion.create({ data: { productId: product.id, version, basePath: `https://${config.data.publicHost}` } });
      for (const item of operations) {
        const endpoint = await transaction.endpoint.create({ data: { versionId: apiVersion.id, method: item.method, path: item.path, publicHost: config.data.publicHost, publicPath: combinePath(config.data.publicPrefix, item.path), routeVersion: version, requestFormat: object(item.operation.requestBody)["content"] ? "JSON" : "ANY", summary: text(item.operation.summary, text(item.operation.operationId, `${item.method} ${item.path}`)), schema: { requestBody: item.operation.requestBody ?? null, responses: item.operation.responses ?? {} } as Prisma.InputJsonValue, corsEnabled: true, forceHttps: true, ipAllowlist: [], ipDenylist: [], requestLogging: true } });
        const parameterRows: Prisma.ApiParameterCreateManyInput[] = item.parameters.map(object).filter((parameter) => ["path", "query"].includes(text(parameter.in)) && text(parameter.name)).map((parameter) => { const schema = object(parameter.schema); return { endpointId: endpoint.id, location: text(parameter.in) === "path" ? "PATH" : "QUERY", name: text(parameter.name), required: parameter.required === true, dataType: text(schema.type, "string"), validation: typeof schema.pattern === "string" ? { pattern: schema.pattern } : {}, sensitive: false }; });
        const bodySchema = object(object(object(item.operation.requestBody).content)["application/json"]); const properties = object(object(bodySchema.schema).properties); const required = Array.isArray(object(bodySchema.schema).required) ? object(bodySchema.schema).required as string[] : [];
        for (const [name, rawProperty] of Object.entries(properties)) { const property = object(rawProperty); parameterRows.push({ endpointId: endpoint.id, location: "BODY", name, required: required.includes(name), dataType: text(property.type, "string"), validation: typeof property.pattern === "string" ? { pattern: property.pattern } : {}, sensitive: false }); }
        if (parameterRows.length) await transaction.apiParameter.createMany({ data: parameterRows });
      }
      await transaction.auditLog.create({ data: { tenantId: auth.workspace?.tenantId, actorId: auth.user.id, action: "api.openapi.import", resource: "api-product", resourceId: product.id, metadata: { endpoints: operations.length, upstreamId: apiUpstream.id, fileName: file.name }, ipAddress: requestIp(request) } });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ code: 409, message: "API 标识或导入后的公开路由与现有配置冲突" }, { status: 409, headers: noStoreHeaders });
    return Response.json({ code: 500, message: "OpenAPI 导入失败" }, { status: 500, headers: noStoreHeaders });
  }
  revalidatePath("/", "layout");
  return Response.json({ code: 201, message: `已导入 ${operations.length} 个端点并创建草稿`, data: await getCatalogProduct(config.data.slug, false) }, { status: 201, headers: noStoreHeaders });
}
