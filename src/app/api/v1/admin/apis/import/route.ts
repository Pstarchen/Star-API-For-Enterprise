import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { apiDataTypes, methodsOverlap, type ApiDataType } from "@/lib/api-contracts";
import { routePatternKey } from "@/lib/api-routes";
import { getCurrentUser, getCurrentWorkspace } from "@/lib/server/auth";
import { getCatalogProduct } from "@/lib/server/catalog";
import { getPlatformConfig } from "@/lib/server/installation";
import { prisma } from "@/lib/server/prisma";
import { noStoreHeaders, requestIp } from "@/lib/server/request";
import { assertSafeUpstream } from "@/lib/server/upstream";

const configSchema = z.object({ name: z.string().trim().min(2).max(80), slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), categoryId: z.string().min(1), publicHost: z.string().trim().toLowerCase().min(1).max(253), publicPrefix: z.string().trim().regex(/^\/(?:[A-Za-z0-9._~!$&'()*+,;=:@%-]+\/?)*$/), upstreamOverride: z.union([z.url(), z.literal("")]).default(""), visibility: z.enum(["PUBLIC", "PRIVATE", "GRAY", "INTERNAL"]).default("PUBLIC"), billingMode: z.enum(["FREE", "PER_REQUEST"]).default("FREE"), unitPrice: z.coerce.number().min(0).max(100000).default(0), defaultQpsLimit: z.coerce.number().int().min(1).max(100000).default(10) }).strict();
const supportedMethods = ["get", "post", "put", "patch", "delete"] as const;
type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {}; }
function text(value: unknown, fallback = "") { return typeof value === "string" ? value : fallback; }
function combinePath(prefix: string, path: string) {
  const joined = `${prefix === "/" ? "" : prefix}/${path}`.replace(/\/{2,}/g, "/");
  return (joined.startsWith("/") ? joined : `/${joined}`).replace(/\/+$/, "") || "/";
}
function versionValue(document: JsonObject) {
  const rawVersion = object(document.info).version;
  const source = typeof rawVersion === "string" || typeof rawVersion === "number" ? String(rawVersion) : "v1";
  const value = source.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 24);
  return value || "v1";
}

function localReference(document: JsonObject, value: unknown, trail = new Set<string>()): JsonObject {
  const source = object(value);
  const reference = text(source.$ref);
  if (!reference) return source;
  if (!reference.startsWith("#/")) throw new Error("EXTERNAL_REFERENCE_UNSUPPORTED");
  if (trail.has(reference)) throw new Error("CYCLIC_REFERENCE");
  let target: unknown = document;
  for (const rawSegment of reference.slice(2).split("/")) {
    const segment = decodeURIComponent(rawSegment).replaceAll("~1", "/").replaceAll("~0", "~");
    if (!target || typeof target !== "object" || Array.isArray(target) || !(segment in target)) throw new Error("REFERENCE_NOT_FOUND");
    target = (target as JsonObject)[segment];
  }
  const nextTrail = new Set(trail).add(reference);
  const siblings = { ...source };
  delete siblings.$ref;
  return { ...localReference(document, target, nextTrail), ...siblings };
}

function flattenedSchema(document: JsonObject, value: unknown): JsonObject {
  const schema = localReference(document, value);
  const alternatives = Array.isArray(schema.oneOf) ? schema.oneOf : Array.isArray(schema.anyOf) ? schema.anyOf : [];
  const base = !schema.type && !schema.properties && alternatives.length ? flattenedSchema(document, alternatives[0]) : schema;
  if (!Array.isArray(base.allOf)) return base;
  const parts = base.allOf.map((part) => flattenedSchema(document, part));
  return {
    ...parts.reduce<JsonObject>((result, part) => ({ ...result, ...part }), {}),
    ...base,
    properties: Object.assign({}, ...parts.map((part) => object(part.properties)), object(base.properties)),
    required: [...new Set([...parts.flatMap((part) => Array.isArray(part.required) ? part.required.filter((item): item is string => typeof item === "string") : []), ...(Array.isArray(base.required) ? base.required.filter((item): item is string => typeof item === "string") : [])])],
  };
}

function schemaType(document: JsonObject, value: unknown): ApiDataType {
  const schema = flattenedSchema(document, value);
  const rawType = Array.isArray(schema.type) ? schema.type.find((item) => item !== "null") : schema.type;
  if (typeof rawType === "string" && (apiDataTypes as readonly string[]).includes(rawType)) return rawType as ApiDataType;
  if (schema.properties) return "object";
  if (schema.items) return "array";
  return "string";
}

function schemaExample(document: JsonObject, value: unknown, depth = 0): unknown {
  if (depth > 6) return null;
  const schema = flattenedSchema(document, value);
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
  const type = schemaType(document, schema);
  if (type === "object") return Object.fromEntries(Object.entries(object(schema.properties)).slice(0, 40).map(([name, property]) => [name, schemaExample(document, property, depth + 1)]));
  if (type === "array") return [schemaExample(document, schema.items, depth + 1)];
  if (type === "integer" || type === "number") return 0;
  if (type === "boolean") return true;
  return "string";
}

function mediaExample(document: JsonObject, media: JsonObject) {
  if (media.example !== undefined) return media.example;
  const examples = Object.values(object(media.examples));
  if (examples.length) {
    const example = localReference(document, examples[0]);
    if (example.value !== undefined) return example.value;
  }
  return media.schema ? schemaExample(document, media.schema) : undefined;
}

function responseFormats(content: JsonObject) {
  const mediaTypes = Object.keys(content).map((item) => item.toLowerCase());
  const formats = [
    mediaTypes.some((item) => item === "text/plain") ? "TXT" : null,
    mediaTypes.some((item) => item === "application/json" || item.endsWith("+json")) ? "JSON" : null,
    mediaTypes.some((item) => item !== "text/plain" && item !== "application/json" && !item.endsWith("+json")) ? "BINARY" : null,
  ].filter((item): item is string => Boolean(item));
  return formats.length ? formats : ["JSON"];
}

function requestFormat(content: JsonObject) {
  const mediaTypes = Object.keys(content).map((item) => item.toLowerCase());
  if (mediaTypes.some((item) => item === "application/json" || item.endsWith("+json"))) return "JSON";
  if (mediaTypes.some((item) => item === "application/x-www-form-urlencoded" || item === "multipart/form-data")) return "FORM";
  if (mediaTypes.length) return "BINARY";
  return "ANY";
}

function expandedServerUrl(rawServer: unknown) {
  const server = object(rawServer);
  return text(server.url).replace(/\{([^{}]+)\}/g, (_match, name: string) => {
    const defaultValue = object(object(server.variables)[name]).default;
    if (typeof defaultValue !== "string" && typeof defaultValue !== "number") throw new Error("SERVER_VARIABLE_DEFAULT_REQUIRED");
    return String(defaultValue);
  });
}

function importErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "OpenAPI 文档内容无法解析";
  const messages: Record<string, string> = {
    EXTERNAL_REFERENCE_UNSUPPORTED: "OpenAPI 文档包含外部 $ref；请先将引用合并为单个 JSON/YAML 文件",
    CYCLIC_REFERENCE: "OpenAPI 文档包含无法展开的循环 $ref",
    REFERENCE_NOT_FOUND: "OpenAPI 文档中的本地 $ref 指向不存在的组件",
    SERVER_VARIABLE_DEFAULT_REQUIRED: "OpenAPI servers 变量必须提供 default 值",
  };
  return messages[error.message] ?? "OpenAPI 文档内容无法解析";
}

function serializedDefault(value: unknown) {
  if (value === null || value === undefined) return null;
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function preferredMedia(document: JsonObject, content: JsonObject) {
  const entry = Object.entries(content).find(([type]) => type === "application/json")
    ?? Object.entries(content).find(([type]) => type.endsWith("+json"))
    ?? Object.entries(content)[0];
  return entry ? localReference(document, entry[1]) : {};
}

type ImportedParameter = {
  location: "PATH" | "QUERY" | "BODY";
  name: string;
  required: boolean;
  dataType: ApiDataType;
  defaultValue: string | null;
  description: string;
  validation: Prisma.InputJsonValue;
  sensitive: boolean;
};

type ImportedResponseParameter = { name: string; dataType: ApiDataType; description: string; sortOrder: number };

function operationContract(document: JsonObject, operation: JsonObject, rawParameters: unknown[]) {
  const parameters = new Map<string, ImportedParameter>();
  for (const rawParameter of rawParameters) {
    const parameter = localReference(document, rawParameter);
    const location = text(parameter.in);
    const name = text(parameter.name);
    if (!name || !["path", "query"].includes(location)) continue;
    const content = object(parameter.content);
    const firstContent = Object.values(content)[0];
    const rawSchema = parameter.schema ?? (firstContent ? object(firstContent).schema : undefined);
    const schema = flattenedSchema(document, rawSchema);
    parameters.set(`${location}:${name}`, {
      location: location === "path" ? "PATH" : "QUERY",
      name,
      required: location === "path" || parameter.required === true,
      dataType: schemaType(document, schema),
      defaultValue: serializedDefault(schema.default),
      description: text(parameter.description, text(schema.description)),
      validation: typeof schema.pattern === "string" ? { pattern: schema.pattern } : {},
      sensitive: schema.format === "password",
    });
  }

  const requestBody = operation.requestBody ? localReference(document, operation.requestBody) : {};
  const requestContent = object(requestBody.content);
  const requestMedia = preferredMedia(document, requestContent);
  const bodySchema = flattenedSchema(document, requestMedia.schema);
  const bodyRequired = new Set(Array.isArray(bodySchema.required) ? bodySchema.required.filter((item): item is string => typeof item === "string") : []);
  for (const [name, rawProperty] of Object.entries(object(bodySchema.properties))) {
    const property = flattenedSchema(document, rawProperty);
    parameters.set(`body:${name}`, {
      location: "BODY",
      name,
      required: bodyRequired.has(name),
      dataType: schemaType(document, property),
      defaultValue: serializedDefault(property.default),
      description: text(property.description),
      validation: typeof property.pattern === "string" ? { pattern: property.pattern } : {},
      sensitive: property.format === "password",
    });
  }

  const rawResponses = object(operation.responses);
  const successEntry = Object.entries(rawResponses).find(([status]) => /^2\d\d$/.test(status)) ?? Object.entries(rawResponses).find(([status]) => status === "default");
  const successResponse = successEntry ? localReference(document, successEntry[1]) : {};
  const responseContent = object(successResponse.content);
  const responseMedia = preferredMedia(document, responseContent);
  const responseSchema = flattenedSchema(document, responseMedia.schema);
  const responseProperties = Object.entries(object(responseSchema.properties));
  const responseParameters: ImportedResponseParameter[] = responseProperties.length
    ? responseProperties.slice(0, 200).map(([name, rawProperty], sortOrder) => {
      const property = flattenedSchema(document, rawProperty);
      return { name, dataType: schemaType(document, property), description: text(property.description), sortOrder };
    })
    : responseMedia.schema ? [{ name: responseSchema.type === "array" ? "items" : "value", dataType: schemaType(document, responseSchema), description: text(responseSchema.description, text(successResponse.description)), sortOrder: 0 }] : [];

  return {
    parameters: [...parameters.values()],
    responseParameters,
    requestFormat: requestFormat(requestContent),
    responseFormats: responseFormats(responseContent),
    responseExample: Object.keys(responseContent).length ? mediaExample(document, responseMedia) : undefined,
    requestBody,
    responses: rawResponses,
  };
}

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
  let decodedConfig: unknown = null;
  try { decodedConfig = typeof rawConfig === "string" ? JSON.parse(rawConfig) : null; }
  catch { return Response.json({ code: 400, message: "导入配置不是有效的 JSON" }, { status: 400, headers: noStoreHeaders }); }
  const config = configSchema.safeParse(decodedConfig);
  if (!config.success) return Response.json({ code: 400, message: "导入配置不正确", details: z.flattenError(config.error) }, { status: 400, headers: noStoreHeaders });
  const category = await prisma.apiCategory.findFirst({ where: { id: config.data.categoryId, enabled: true } });
  if (!category) return Response.json({ code: 400, message: "所选 API 分类不存在或已停用" }, { status: 400, headers: noStoreHeaders });
  let document: JsonObject;
  try { document = object(parseYaml(await file.text())); } catch { return Response.json({ code: 400, message: "OpenAPI 文件不是有效的 JSON 或 YAML" }, { status: 400, headers: noStoreHeaders }); }
  if (!text(document.openapi).startsWith("3.")) return Response.json({ code: 400, message: "当前仅支持 OpenAPI 3.x 文档" }, { status: 400, headers: noStoreHeaders });
  let operations: Array<{ path: string; method: string; operation: JsonObject; contract: ReturnType<typeof operationContract> }>;
  let upstreamUrl: string;
  try {
    const paths = object(document.paths);
    operations = Object.entries(paths).flatMap(([path, rawPath]) => {
      if (!/^\/(?:[A-Za-z0-9._~!$&'()*+,;=:@%{}-]+\/?)*$/.test(path)) throw new Error("INVALID_DOCUMENT_PATH");
      const pathItem = localReference(document, rawPath);
      const sharedParameters = Array.isArray(pathItem.parameters) ? pathItem.parameters : [];
      return supportedMethods.flatMap((method) => {
        if (!pathItem[method]) return [];
        const operation = localReference(document, pathItem[method]);
        const operationParameters = Array.isArray(operation.parameters) ? operation.parameters : [];
        return [{ path, method: method.toUpperCase(), operation, contract: operationContract(document, operation, [...sharedParameters, ...operationParameters]) }];
      });
    });
    const firstServer = Array.isArray(document.servers) ? document.servers[0] : null;
    upstreamUrl = config.data.upstreamOverride || expandedServerUrl(firstServer);
  } catch (error) {
    return Response.json({ code: 400, message: error instanceof Error && error.message === "INVALID_DOCUMENT_PATH" ? "OpenAPI 文档中包含无法发布的路径" : importErrorMessage(error) }, { status: 400, headers: noStoreHeaders });
  }
  if (!operations.length) return Response.json({ code: 400, message: "OpenAPI 文档中没有可导入的 HTTP 端点" }, { status: 400, headers: noStoreHeaders });
  if (operations.length > 100) return Response.json({ code: 400, message: "单次最多导入 100 个端点" }, { status: 400, headers: noStoreHeaders });
  const importedRoutes = operations.map((item) => ({ publicPath: combinePath(config.data.publicPrefix, item.path), methods: [item.method] }));
  const duplicateRoute = importedRoutes.some((route, index) => importedRoutes.slice(0, index).some((previous) => routePatternKey(previous.publicPath) === routePatternKey(route.publicPath) && methodsOverlap(previous.methods, route.methods)));
  if (duplicateRoute) return Response.json({ code: 409, message: "OpenAPI 文档中包含重复或冲突的公开路由" }, { status: 409, headers: noStoreHeaders });
  const existingEndpoints = await prisma.endpoint.findMany({ where: { publicHost: config.data.publicHost, routeVersion: versionValue(document) }, select: { publicPath: true, methods: true } });
  const conflictingRoute = importedRoutes.find((route) => existingEndpoints.some((existing) => routePatternKey(existing.publicPath) === routePatternKey(route.publicPath) && methodsOverlap(existing.methods, route.methods)));
  if (conflictingRoute) return Response.json({ code: 409, message: `导入路由 ${conflictingRoute.publicPath} 与现有 API 冲突` }, { status: 409, headers: noStoreHeaders });
  if (!upstreamUrl) return Response.json({ code: 400, message: "文档缺少 servers[0].url，请填写上游覆盖地址" }, { status: 400, headers: noStoreHeaders });
  let upstream: URL;
  try { upstream = await assertSafeUpstream(upstreamUrl, "PUBLIC_API"); } catch (error) { return Response.json({ code: 400, message: `上游地址不允许：${error instanceof Error ? error.message : "INVALID_UPSTREAM"}` }, { status: 400, headers: noStoreHeaders }); }
  const version = versionValue(document);
  const info = object(document.info);
  const platform = await getPlatformConfig();
  try {
    await prisma.$transaction(async (transaction) => {
      let provider = auth.isAdmin ? await transaction.provider.findFirst({ where: { name: text(info["x-provider"], config.data.name) } }) : await transaction.provider.findFirst({ where: { ownerTenantId: auth.workspace.tenantId } });
      if (!provider) provider = await transaction.provider.create({ data: { ownerTenantId: auth.isAdmin ? null : auth.workspace.tenantId, name: auth.isAdmin ? text(info["x-provider"], config.data.name) : auth.workspace.tenant.name, legalName: auth.isAdmin ? text(info["x-provider"], config.data.name) : auth.workspace.tenant.name, contactEmail: auth.user.email } });
      const product = await transaction.apiProduct.create({ data: { providerId: provider.id, categoryId: category.id, slug: config.data.slug, name: config.data.name, shortName: Array.from(config.data.name).slice(0, 4).join(""), description: text(info.description, `${config.data.name} OpenAPI 服务`), color: "#586be8", tags: ["OpenAPI"], featured: false, status: "DRAFT", visibility: config.data.visibility, sla: 99.9, executionConfig: { sourceType: "OPENAPI_IMPORT" }, billingMode: config.data.billingMode, unitPrice: config.data.billingMode === "FREE" ? 0 : config.data.unitPrice, defaultQpsLimit: config.data.defaultQpsLimit } });
      const apiUpstream = await transaction.apiUpstream.create({ data: { productId: product.id, type: "PUBLIC_API", rewriteMode: upstream.pathname && upstream.pathname !== "/" ? "PREFIX" : "PASSTHROUGH", upstreamPrefix: upstream.pathname === "/" ? "" : upstream.pathname.replace(/\/$/, ""), healthPath: "/", timeoutMs: 10000, authType: "NONE", nodes: { create: { name: "OpenAPI 主节点", baseUrl: upstream.origin, weight: 100 } } } });
      const apiVersion = await transaction.apiVersion.create({ data: { productId: product.id, version, basePath: `https://${config.data.publicHost}` } });
      for (const item of operations) {
        const endpoint = await transaction.endpoint.create({ data: { versionId: apiVersion.id, methods: [item.method], path: item.path, publicHost: config.data.publicHost, publicPath: combinePath(config.data.publicPrefix, item.path), routeVersion: version, requestFormat: item.contract.requestFormat, responseFormats: item.contract.responseFormats, ...(item.contract.responseExample === undefined ? {} : { responseExample: item.contract.responseExample as Prisma.InputJsonValue }), summary: text(item.operation.summary, text(item.operation.operationId, `${item.method} ${item.path}`)), schema: { requestBody: item.contract.requestBody, responses: item.contract.responses } as Prisma.InputJsonValue, corsEnabled: true, forceHttps: platform.publicUrl.startsWith("https://"), ipAllowlist: [], ipDenylist: [], requestLogging: true } });
        if (item.contract.parameters.length) await transaction.apiParameter.createMany({ data: item.contract.parameters.map((parameter) => ({ endpointId: endpoint.id, ...parameter })) });
        if (item.contract.responseParameters.length) await transaction.apiResponseParameter.createMany({ data: item.contract.responseParameters.map((parameter) => ({ endpointId: endpoint.id, ...parameter })) });
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
