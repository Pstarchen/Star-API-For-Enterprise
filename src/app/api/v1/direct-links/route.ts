import { z } from "zod";
import { getCurrentUser } from "@/lib/server/auth";
import { getApplication } from "@/lib/server/applications";
import { issueDirectLinkToken } from "@/lib/server/direct-link";
import { prisma } from "@/lib/server/prisma";
import { noStoreHeaders, requestIp } from "@/lib/server/request";

const createSchema = z.object({
  subscriptionId: z.string().min(1).max(64),
  endpointId: z.string().min(1).max(64),
  name: z.string().trim().min(2).max(60),
  defaultParameters: z.record(z.string().min(1).max(120), z.string().max(2048)).refine((value) => Object.keys(value).length <= 30, "默认参数过多").default({}),
  expiresInDays: z.union([z.literal(7), z.literal(30), z.literal(90), z.null()]).default(null),
}).strict();
const revokeSchema = z.object({ id: z.string().min(1).max(64) }).strict();

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ code: 401, message: "请先登录" }, { status: 401, headers: noStoreHeaders });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: 400, message: "直链参数不正确", details: z.treeifyError(parsed.error) }, { status: 400, headers: noStoreHeaders });

  const subscription = await prisma.subscription.findFirst({
    where: { id: parsed.data.subscriptionId, status: "ACTIVE", app: { tenant: { memberships: { some: { userId: user.id } } } } },
    include: { app: true, product: true },
  });
  if (!subscription) return Response.json({ code: 404, message: "订阅不存在、已失效或无权访问" }, { status: 404, headers: noStoreHeaders });
  const endpoint = await prisma.endpoint.findFirst({
    where: {
      id: parsed.data.endpointId,
      methods: { hasSome: ["GET", "ALL"] },
      version: { productId: subscription.productId, product: { status: { in: ["PUBLISHED", "GRAY"] }, visibility: { not: "INTERNAL" } } },
    },
    include: { parameters: true },
  });
  if (!endpoint) return Response.json({ code: 409, message: "该端点不支持生成直链，请选择已发布的 GET 端点" }, { status: 409, headers: noStoreHeaders });

  const allowedParameters = new Set(endpoint.parameters.filter((item) => item.location === "PATH" || item.location === "QUERY").map((item) => item.name));
  const unknownParameter = Object.keys(parsed.data.defaultParameters).find((name) => !allowedParameters.has(name));
  if (unknownParameter) return Response.json({ code: 400, message: `端点不支持参数：${unknownParameter}` }, { status: 400, headers: noStoreHeaders });

  const credential = issueDirectLinkToken();
  const expiresAt = parsed.data.expiresInDays ? new Date(Date.now() + parsed.data.expiresInDays * 86_400_000) : null;
  const link = await prisma.$transaction(async (transaction) => {
    const created = await transaction.directLink.create({
      data: {
        subscriptionId: subscription.id,
        endpointId: endpoint.id,
        name: parsed.data.name,
        prefix: credential.prefix,
        tokenHash: credential.tokenHash,
        tokenEncrypted: credential.tokenEncrypted,
        defaultParameters: parsed.data.defaultParameters,
        expiresAt,
      },
    });
    await transaction.auditLog.create({
      data: {
        tenantId: subscription.app.tenantId,
        actorId: user.id,
        action: "direct-link.create",
        resource: "direct-link",
        resourceId: created.id,
        metadata: { appId: subscription.appId, productId: subscription.productId, endpointId: endpoint.id, prefix: credential.prefix, expiresAt: expiresAt?.toISOString() ?? null },
        ipAddress: requestIp(request),
      },
    });
    return created;
  });

  return Response.json({ code: 201, message: "直链已生成", data: { app: await getApplication(subscription.appId), directLinkId: link.id, path: `/l/${credential.token}` } }, { status: 201, headers: noStoreHeaders });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ code: 401, message: "请先登录" }, { status: 401, headers: noStoreHeaders });
  const parsed = revokeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: 400, message: "直链参数不正确" }, { status: 400, headers: noStoreHeaders });
  const link = await prisma.directLink.findFirst({
    where: { id: parsed.data.id, subscription: { app: { tenant: { memberships: { some: { userId: user.id } } } } } },
    include: { subscription: { include: { app: true } } },
  });
  if (!link) return Response.json({ code: 404, message: "直链不存在或无权访问" }, { status: 404, headers: noStoreHeaders });
  const revoked = await prisma.$transaction(async (transaction) => {
    const result = await transaction.directLink.updateMany({ where: { id: link.id, status: "ACTIVE" }, data: { status: "REVOKED" } });
    if (!result.count) return false;
    await transaction.auditLog.create({
      data: { tenantId: link.subscription.app.tenantId, actorId: user.id, action: "direct-link.revoke", resource: "direct-link", resourceId: link.id, metadata: { prefix: link.prefix }, ipAddress: requestIp(request) },
    });
    return true;
  });
  if (!revoked) return Response.json({ code: 409, message: "直链已经失效" }, { status: 409, headers: noStoreHeaders });
  return Response.json({ code: 200, message: "直链已撤销", data: await getApplication(link.subscription.appId) }, { headers: noStoreHeaders });
}
