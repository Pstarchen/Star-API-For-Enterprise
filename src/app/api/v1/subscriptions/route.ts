import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/server/auth";
import { getApplication } from "@/lib/server/applications";
import { prisma } from "@/lib/server/prisma";
import { noStoreHeaders, requestIp } from "@/lib/server/request";

const schema = z.object({ appId: z.string().min(1), productId: z.string().min(1) }).strict();

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ code: 401, message: "请先登录" }, { status: 401, headers: noStoreHeaders });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: 400, message: "订阅参数不正确" }, { status: 400, headers: noStoreHeaders });
  const [app, product] = await Promise.all([
    prisma.application.findFirst({ where: { id: parsed.data.appId, tenant: { memberships: { some: { userId: user.id } } } } }),
    prisma.apiProduct.findFirst({ where: { id: parsed.data.productId, status: "PUBLISHED" } }),
  ]);
  if (!app) return Response.json({ code: 404, message: "应用不存在或无权访问" }, { status: 404, headers: noStoreHeaders });
  if (!product) return Response.json({ code: 404, message: "API 不存在或尚未发布" }, { status: 404, headers: noStoreHeaders });
  const existing = await prisma.subscription.findFirst({ where: { appId: app.id, productId: product.id } });
  if (existing?.status === "ACTIVE") return Response.json({ code: 409, message: "该应用已经订阅此 API" }, { status: 409, headers: noStoreHeaders });

  if (existing) {
    const restored = await prisma.$transaction(async (transaction) => {
      const result = await transaction.subscription.updateMany({
        where: { id: existing.id, status: { not: "ACTIVE" } },
        data: { status: "ACTIVE", quotaMonthly: 0, qpsLimit: product.defaultQpsLimit, unitPrice: product.unitPrice },
      });
      if (result.count === 0) return false;
      await transaction.auditLog.create({
        data: {
          tenantId: app.tenantId,
          actorId: user.id,
          action: "subscription.reactivate",
          resource: "subscription",
          resourceId: existing.id,
          metadata: { appId: app.id, productId: product.id, previousStatus: existing.status },
          ipAddress: requestIp(request),
        },
      });
      return true;
    });
    if (!restored) return Response.json({ code: 409, message: "该应用已经订阅此 API" }, { status: 409, headers: noStoreHeaders });
    return Response.json({ code: 201, message: "API 已重新订阅", data: await getApplication(app.id) }, { status: 201, headers: noStoreHeaders });
  }

  try {
    await prisma.$transaction(async (transaction) => {
      await transaction.subscription.create({ data: { appId: app.id, productId: product.id, quotaMonthly: 0, qpsLimit: product.defaultQpsLimit, unitPrice: product.unitPrice } });
      await transaction.auditLog.create({ data: { tenantId: app.tenantId, actorId: user.id, action: "subscription.create", resource: "api-product", resourceId: product.id, metadata: { appId: app.id }, ipAddress: requestIp(request) } });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ code: 409, message: "该应用已经订阅此 API" }, { status: 409, headers: noStoreHeaders });
    throw error;
  }
  return Response.json({ code: 201, message: "API 订阅成功", data: await getApplication(app.id) }, { status: 201, headers: noStoreHeaders });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ code: 401, message: "请先登录" }, { status: 401, headers: noStoreHeaders });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ code: 400, message: "缺少订阅 ID" }, { status: 400, headers: noStoreHeaders });
  const subscription = await prisma.subscription.findFirst({ where: { id, app: { tenant: { memberships: { some: { userId: user.id } } } } }, include: { app: true } });
  if (!subscription) return Response.json({ code: 404, message: "订阅不存在或无权访问" }, { status: 404, headers: noStoreHeaders });
  const canceled = await prisma.$transaction(async (transaction) => {
    const result = await transaction.subscription.updateMany({ where: { id, status: "ACTIVE" }, data: { status: "CANCELED" } });
    if (result.count === 0) return false;
    await transaction.auditLog.create({ data: { tenantId: subscription.app.tenantId, actorId: user.id, action: "subscription.cancel", resource: "subscription", resourceId: id, metadata: { productId: subscription.productId }, ipAddress: requestIp(request) } });
    return true;
  });
  if (!canceled) return Response.json({ code: 409, message: "订阅已经取消或暂停" }, { status: 409, headers: noStoreHeaders });
  return Response.json({ code: 200, message: "订阅已取消", data: await getApplication(subscription.appId) }, { headers: noStoreHeaders });
}
