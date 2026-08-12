import { getCurrentUser, getCurrentWorkspace } from "@/lib/server/auth";
import { prisma } from "@/lib/server/prisma";
import { noStoreHeaders } from "@/lib/server/request";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ code: 401, message: "请先登录" }, { status: 401, headers: noStoreHeaders });
  const workspace = await getCurrentWorkspace(user);
  if (!workspace) return Response.json({ code: 409, message: "当前账号没有工作区" }, { status: 409, headers: noStoreHeaders });
  const [tenant, entries, orders] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: workspace.tenantId }, select: { balance: true } }),
    prisma.walletEntry.findMany({ where: { tenantId: workspace.tenantId }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.paymentOrder.findMany({ where: { tenantId: workspace.tenantId, orderType: "RECHARGE" }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  return Response.json({
    code: 200,
    data: {
      balance: tenant?.balance.toString() ?? "0.00",
      entries: entries.map((entry) => ({ id: entry.id, type: entry.type, delta: entry.delta.toString(), balanceAfter: entry.balanceAfter.toString(), reason: entry.reason, createdAt: entry.createdAt.toISOString() })),
      orders: orders.map((order) => ({ id: order.id, orderNo: order.orderNo, channel: order.channel, status: order.status, amount: order.amount.toString(), createdAt: order.createdAt.toISOString(), paidAt: order.paidAt?.toISOString() ?? null })),
    },
  }, { headers: noStoreHeaders });
}
