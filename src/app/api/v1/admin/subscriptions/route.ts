import { z } from "zod";
import { getCurrentUser } from "@/lib/server/auth";
import { getApplication } from "@/lib/server/applications";
import { listAdminSubscriptions } from "@/lib/server/admin-subscriptions";
import { prisma } from "@/lib/server/prisma";
import { noStoreHeaders, requestIp } from "@/lib/server/request";

const updateSchema = z.object({
  id: z.string().min(1),
  quotaMonthly: z.coerce.number().int().min(0).max(1_000_000_000),
  qpsLimit: z.coerce.number().int().min(1).max(100_000),
}).strict();

async function authorize() {
  const user = await getCurrentUser();
  if (!user) return { error: Response.json({ code: 401, message: "请先登录" }, { status: 401, headers: noStoreHeaders }) } as const;
  if (user.platformRole !== "ADMIN") return { error: Response.json({ code: 403, message: "仅平台管理员可以管理订阅策略" }, { status: 403, headers: noStoreHeaders }) } as const;
  return { user } as const;
}

export async function GET() {
  const auth = await authorize();
  if ("error" in auth) return auth.error;
  return Response.json({ code: 200, data: await listAdminSubscriptions() }, { headers: noStoreHeaders });
}

export async function PATCH(request: Request) {
  const auth = await authorize();
  if ("error" in auth) return auth.error;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: 400, message: "订阅策略参数不正确", details: z.flattenError(parsed.error) }, { status: 400, headers: noStoreHeaders });
  const existing = await prisma.subscription.findUnique({ where: { id: parsed.data.id }, include: { app: true, product: true } });
  if (!existing) return Response.json({ code: 404, message: "订阅不存在" }, { status: 404, headers: noStoreHeaders });
  await prisma.$transaction([
    prisma.subscription.update({
      where: { id: existing.id },
      data: { quotaMonthly: BigInt(parsed.data.quotaMonthly), qpsLimit: parsed.data.qpsLimit },
    }),
    prisma.auditLog.create({
      data: {
        tenantId: existing.app.tenantId,
        actorId: auth.user.id,
        action: "subscription.policy.update",
        resource: "subscription",
        resourceId: existing.id,
        metadata: {
          appId: existing.appId,
          productId: existing.productId,
          previousQuotaMonthly: existing.quotaMonthly.toString(),
          quotaMonthly: String(parsed.data.quotaMonthly),
          previousQpsLimit: existing.qpsLimit,
          qpsLimit: parsed.data.qpsLimit,
        },
        ipAddress: requestIp(request),
      },
    }),
  ]);
  return Response.json({ code: 200, message: "订阅配额与限流策略已更新", data: await getApplication(existing.appId) }, { headers: noStoreHeaders });
}
