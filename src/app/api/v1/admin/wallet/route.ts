import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/server/auth";
import { adjustWalletBalance } from "@/lib/server/payments";
import { prisma } from "@/lib/server/prisma";
import { noStoreHeaders, requestIp } from "@/lib/server/request";

const schema = z.object({
  tenantId: z.string().min(1),
  type: z.enum(["ADMIN_RECHARGE", "ADMIN_REFUND"]),
  amount: z.string().regex(/^\d{1,9}(\.\d{1,2})?$/, "金额格式不正确"),
  reason: z.string().trim().min(2).max(200),
}).strict();

async function authorize() {
  const user = await getCurrentUser();
  if (!user) return { error: Response.json({ code: 401, message: "请先登录" }, { status: 401, headers: noStoreHeaders }) } as const;
  if (user.platformRole !== "ADMIN") return { error: Response.json({ code: 403, message: "仅平台管理员可以管理余额" }, { status: 403, headers: noStoreHeaders }) } as const;
  return { user } as const;
}

export async function GET() {
  const auth = await authorize();
  if ("error" in auth) return auth.error;
  const tenants = await prisma.tenant.findMany({
    include: { memberships: { include: { user: { select: { id: true, name: true, email: true } } } }, walletEntries: { orderBy: { createdAt: "desc" }, take: 5 } },
    orderBy: { updatedAt: "desc" },
  });
  return Response.json({ code: 200, data: tenants.map((tenant) => ({
    id: tenant.id,
    name: tenant.name,
    type: tenant.type,
    balance: tenant.balance.toString(),
    members: tenant.memberships.map((membership) => membership.user),
    recentEntries: tenant.walletEntries.map((entry) => ({ id: entry.id, type: entry.type, delta: entry.delta.toString(), balanceAfter: entry.balanceAfter.toString(), reason: entry.reason, createdAt: entry.createdAt.toISOString() })),
  })) }, { headers: noStoreHeaders });
}

export async function PATCH(request: Request) {
  const auth = await authorize();
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: 400, message: "余额调整参数不正确" }, { status: 400, headers: noStoreHeaders });
  try {
    const result = await adjustWalletBalance({ tenantId: parsed.data.tenantId, type: parsed.data.type, amount: new Prisma.Decimal(parsed.data.amount), reason: parsed.data.reason, actorId: auth.user.id, ipAddress: requestIp(request) });
    return Response.json({ code: 200, message: parsed.data.type === "ADMIN_RECHARGE" ? "余额充值已完成" : "余额退款已完成", data: { balance: result.balance.toString(), entry: { id: result.entry.id, type: result.entry.type, delta: result.entry.delta.toString(), balanceAfter: result.entry.balanceAfter.toString(), reason: result.entry.reason, createdAt: result.entry.createdAt.toISOString() } } }, { headers: noStoreHeaders });
  } catch (error) {
    const message = error instanceof Error && error.message === "WALLET_INSUFFICIENT_BALANCE" ? "退款金额不能超过当前余额" : error instanceof Error && error.message === "TENANT_NOT_FOUND" ? "工作区不存在" : "余额调整失败，请刷新后重试";
    return Response.json({ code: 409, message }, { status: 409, headers: noStoreHeaders });
  }
}
