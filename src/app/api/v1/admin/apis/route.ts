import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { apiCategories } from "@/lib/catalog";
import { internalHandlerTemplates } from "@/lib/internal-handlers";
import { getCurrentUser } from "@/lib/server/auth";
import { getCatalogProduct } from "@/lib/server/catalog";
import { encryptJson } from "@/lib/server/encryption";
import { prisma } from "@/lib/server/prisma";
import { noStoreHeaders, requestIp } from "@/lib/server/request";

const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
const handlerIds = internalHandlerTemplates.map((item) => item.id) as [string, ...string[]];

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "标识仅支持小写字母、数字和连字符"),
  shortName: z.string().trim().min(1).max(4),
  description: z.string().trim().min(10).max(1000),
  category: z.enum(apiCategories),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  tags: z.array(z.string().trim().min(1).max(24)).max(10),
  featured: z.boolean().default(false),
  providerName: z.string().trim().min(2).max(100),
  providerLegalName: z.string().trim().min(2).max(160),
  providerEmail: z.email().transform((value) => value.trim().toLowerCase()),
  version: z.string().trim().min(1).max(24).regex(/^[A-Za-z0-9._-]+$/),
  method: z.enum(methods),
  path: z.string().trim().min(1).max(180).regex(/^\/(?:[A-Za-z0-9._~!$&'()*+,;=:@%-]+\/?)*$/, "路径必须以 / 开头且不能包含查询参数"),
  summary: z.string().trim().min(2).max(160),
  executionMode: z.enum(["INTERNAL", "EXTERNAL"]),
  internalHandler: z.enum(handlerIds).optional(),
  upstreamBaseUrl: z.url().optional(),
  upstreamAuthType: z.enum(["NONE", "BEARER", "HEADER"]).default("NONE"),
  upstreamToken: z.string().max(4000).optional(),
  upstreamHeaderName: z.string().trim().max(80).optional(),
  upstreamHeaderValue: z.string().max(4000).optional(),
  allowPrivateNetwork: z.boolean().default(false),
  timeoutMs: z.coerce.number().int().min(500).max(60000),
  billingMode: z.enum(["FREE", "PER_REQUEST"]),
  unitPrice: z.coerce.number().min(0).max(100000),
  freeQuotaMonthly: z.coerce.number().int().min(0).max(1_000_000_000),
  defaultQpsLimit: z.coerce.number().int().min(1).max(100000),
  sla: z.coerce.number().min(0).max(100),
}).strict().superRefine((value, context) => {
  if (value.executionMode === "INTERNAL") {
    const template = internalHandlerTemplates.find((item) => item.id === value.internalHandler);
    if (!template) context.addIssue({ code: "custom", path: ["internalHandler"], message: "请选择内置处理器" });
    else if (!(template.methods as readonly string[]).includes(value.method)) context.addIssue({ code: "custom", path: ["method"], message: "该处理器不支持所选请求方法" });
  }
  if (value.executionMode === "EXTERNAL" && !value.upstreamBaseUrl) context.addIssue({ code: "custom", path: ["upstreamBaseUrl"], message: "请填写外部上游地址" });
  if (value.upstreamAuthType === "BEARER" && !value.upstreamToken) context.addIssue({ code: "custom", path: ["upstreamToken"], message: "请填写 Bearer Token" });
  if (value.upstreamAuthType === "HEADER" && (!value.upstreamHeaderName || !value.upstreamHeaderValue)) context.addIssue({ code: "custom", path: ["upstreamHeaderName"], message: "请填写鉴权请求头名称和值" });
  if (value.billingMode === "PER_REQUEST" && value.unitPrice <= 0) context.addIssue({ code: "custom", path: ["unitPrice"], message: "按次计费单价必须大于 0" });
});

const statusSchema = z.object({ id: z.string().min(1), status: z.enum(["DRAFT", "REVIEW", "PUBLISHED", "DEPRECATED", "OFFLINE"]) }).strict();

async function admin() {
  const user = await getCurrentUser();
  if (!user) return { error: Response.json({ code: 401, message: "请先登录" }, { status: 401, headers: noStoreHeaders }) } as const;
  if (user.platformRole !== "ADMIN") return { error: Response.json({ code: 403, message: "仅平台管理员可以管理 API" }, { status: 403, headers: noStoreHeaders }) } as const;
  return { user } as const;
}

export async function POST(request: Request) {
  const auth = await admin();
  if ("error" in auth) return auth.error;
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: 400, message: "API 配置不完整", details: z.flattenError(parsed.error) }, { status: 400, headers: noStoreHeaders });
  const input = parsed.data;
  const secretConfig = input.upstreamAuthType === "BEARER"
    ? { token: input.upstreamToken }
    : input.upstreamAuthType === "HEADER" ? { headerName: input.upstreamHeaderName, headerValue: input.upstreamHeaderValue } : {};

  try {
    await prisma.$transaction(async (transaction) => {
      let provider = await transaction.provider.findFirst({ where: { name: input.providerName } });
      if (!provider) provider = await transaction.provider.create({ data: { name: input.providerName, legalName: input.providerLegalName, contactEmail: input.providerEmail } });
      const product = await transaction.apiProduct.create({
        data: {
          providerId: provider.id,
          slug: input.slug,
          name: input.name,
          shortName: input.shortName,
          description: input.description,
          category: input.category,
          color: input.color,
          tags: input.tags,
          featured: input.featured,
          sla: input.sla,
          executionMode: input.executionMode,
          internalHandler: input.executionMode === "INTERNAL" ? input.internalHandler : null,
          upstreamBaseUrl: input.executionMode === "EXTERNAL" ? input.upstreamBaseUrl : null,
          upstreamAuthType: input.executionMode === "EXTERNAL" ? input.upstreamAuthType : null,
          executionConfig: { allowPrivateNetwork: input.allowPrivateNetwork },
          secretConfigEncrypted: Object.keys(secretConfig).length ? encryptJson(secretConfig) : null,
          timeoutMs: input.timeoutMs,
          billingMode: input.billingMode,
          unitPrice: input.billingMode === "FREE" ? 0 : input.unitPrice,
          freeQuotaMonthly: input.freeQuotaMonthly,
          defaultQpsLimit: input.defaultQpsLimit,
          versions: {
            create: {
              version: input.version,
              basePath: `/api/v1/gateway/${input.slug}`,
              endpoints: { create: { method: input.method, path: input.path, summary: input.summary, schema: { type: "object", properties: {} } } },
            },
          },
        },
      });
      await transaction.auditLog.create({ data: { tenantId: auth.user.memberships[0]?.tenantId, actorId: auth.user.id, action: "api.create", resource: "api-product", resourceId: product.id, metadata: { slug: input.slug, executionMode: input.executionMode, billingMode: input.billingMode }, ipAddress: requestIp(request) } });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ code: 409, message: "API 标识或版本已存在" }, { status: 409, headers: noStoreHeaders });
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
  const existing = await prisma.apiProduct.findUnique({ where: { id: parsed.data.id }, include: { versions: { include: { endpoints: true } } } });
  if (!existing) return Response.json({ code: 404, message: "API 不存在" }, { status: 404, headers: noStoreHeaders });
  if (parsed.data.status === "PUBLISHED" && !existing.versions.some((version) => version.endpoints.length)) return Response.json({ code: 409, message: "API 没有可发布的端点" }, { status: 409, headers: noStoreHeaders });
  await prisma.$transaction([
    prisma.apiProduct.update({ where: { id: existing.id }, data: { status: parsed.data.status } }),
    prisma.auditLog.create({ data: { tenantId: auth.user.memberships[0]?.tenantId, actorId: auth.user.id, action: "api.status.update", resource: "api-product", resourceId: existing.id, metadata: { previous: existing.status, next: parsed.data.status }, ipAddress: requestIp(request) } }),
  ]);
  revalidatePath("/", "layout");
  return Response.json({ code: 200, message: "API 状态已更新", data: await getCatalogProduct(existing.slug, false) }, { headers: noStoreHeaders });
}

export async function DELETE(request: Request) {
  const auth = await admin();
  if ("error" in auth) return auth.error;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ code: 400, message: "缺少 API ID" }, { status: 400, headers: noStoreHeaders });
  const existing = await prisma.apiProduct.findUnique({ where: { id }, include: { _count: { select: { subscriptions: true } } } });
  if (!existing) return Response.json({ code: 404, message: "API 不存在" }, { status: 404, headers: noStoreHeaders });
  if (existing._count.subscriptions) return Response.json({ code: 409, message: "已有应用订阅该 API，请先下线并处理订阅" }, { status: 409, headers: noStoreHeaders });
  await prisma.$transaction([
    prisma.apiProduct.delete({ where: { id } }),
    prisma.auditLog.create({ data: { tenantId: auth.user.memberships[0]?.tenantId, actorId: auth.user.id, action: "api.delete", resource: "api-product", resourceId: id, metadata: { slug: existing.slug }, ipAddress: requestIp(request) } }),
  ]);
  revalidatePath("/", "layout");
  return Response.json({ code: 200, message: "API 已删除" }, { headers: noStoreHeaders });
}
