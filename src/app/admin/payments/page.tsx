import { connection } from "next/server";
import { AdminPaymentsManager } from "@/components/admin-payments-manager";
import { prisma } from "@/lib/server/prisma";

export default async function AdminPaymentsPage() {
  await connection();
  const orders = await prisma.paymentOrder.findMany({ include: { tenant: true, invoice: true }, orderBy: { createdAt: "desc" }, take: 500 });
  return <AdminPaymentsManager initialOrders={orders.map((order) => ({ id: order.id, orderNo: order.orderNo, orderType: order.orderType, tenant: order.tenant.name, period: order.invoice?.period ?? null, channel: order.channel, providerName: order.providerNameSnapshot, paymentType: order.paymentType, status: order.status, amount: order.amount.toString(), externalTradeNo: order.externalTradeNo, createdAt: order.createdAt.toISOString(), paidAt: order.paidAt?.toISOString() ?? null }))} />;
}
