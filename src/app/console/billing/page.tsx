import { CircleDollarSign, ReceiptText, Server } from "lucide-react";
import { connection } from "next/server";
import { PaymentManager } from "@/components/payment-manager";
import { getCurrentUser, getCurrentWorkspace } from "@/lib/server/auth";
import { integrationSummaries } from "@/lib/server/integrations";
import { prisma } from "@/lib/server/prisma";

const invoiceNames = { DRAFT: "草稿", ISSUED: "已出账", PAID: "已支付", VOID: "已作废" } as const;

export default async function BillingPage() {
  await connection();
  const user = await getCurrentUser();
  const workspace = user ? await getCurrentWorkspace(user) : null;
  const month = new Date(); month.setDate(1); month.setHours(0, 0, 0, 0);
  const [usage, calls, invoices, orders, channels] = workspace ? await Promise.all([
    prisma.requestLog.aggregate({ where: { app: { tenantId: workspace.tenantId }, occurredAt: { gte: month } }, _sum: { amount: true } }),
    prisma.requestLog.count({ where: { app: { tenantId: workspace.tenantId }, occurredAt: { gte: month } } }),
    prisma.invoice.findMany({ where: { tenantId: workspace.tenantId }, orderBy: { period: "desc" } }),
    prisma.paymentOrder.findMany({ where: { tenantId: workspace.tenantId }, orderBy: { createdAt: "desc" }, take: 100 }),
    integrationSummaries(),
  ]) : [{ _sum: { amount: null } }, 0, [], [], []] as const;
  const outstanding = invoices.filter((item) => item.status === "ISSUED").reduce((sum, item) => sum + Number(item.amount), 0);
  return <div className="mx-auto max-w-[1200px] space-y-5"><div><p className="eyebrow">BILLING</p><h2 className="mt-1 text-xl font-bold">账单与用量</h2><p className="mt-1 text-[11px] text-[var(--muted)]">费用来自真实网关计费日志，支付订单关联正式账单。</p></div><div className="grid gap-3 sm:grid-cols-3"><Metric icon={CircleDollarSign} label="本月调用费用" value={`¥ ${usage._sum.amount?.toString() ?? "0"}`} /><Metric icon={Server} label="本月调用量" value={`${calls.toLocaleString("zh-CN")} 次`} /><Metric icon={ReceiptText} label="待支付账单" value={`¥ ${outstanding.toFixed(2)}`} /></div><section className="panel overflow-hidden"><div className="border-b border-[var(--line)] px-5 py-4"><h3 className="text-[13px] font-bold">月度账单</h3></div><div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-[10px]"><thead className="bg-[var(--surface-subtle)] text-[var(--muted)]"><tr><th className="px-5 py-3">账期</th><th className="px-5 py-3">金额</th><th className="px-5 py-3">状态</th><th className="px-5 py-3">出账时间</th></tr></thead><tbody className="divide-y divide-[var(--line)]">{invoices.map((invoice) => <tr key={invoice.id}><td className="px-5 py-4 font-semibold">{invoice.period}</td><td className="px-5 py-4">¥{invoice.amount.toString()}</td><td className="px-5 py-4">{invoiceNames[invoice.status]}</td><td className="px-5 py-4 text-[var(--muted)]">{invoice.issuedAt?.toLocaleString("zh-CN") ?? "尚未出账"}</td></tr>)}</tbody></table></div>{!invoices.length && <div className="py-14 text-center text-[10px] text-[var(--muted)]">暂无正式账单</div>}</section><PaymentManager invoices={invoices.filter((item) => item.status === "ISSUED").map((item) => ({ id: item.id, period: item.period, amount: item.amount.toString() }))} initialOrders={orders.map((item) => ({ id: item.id, orderNo: item.orderNo, channel: item.channel, status: item.status, amount: item.amount.toString(), createdAt: item.createdAt.toISOString(), paidAt: item.paidAt?.toISOString() ?? null }))} channels={channels.filter((item): item is typeof item & { key: "alipay" | "wechat" | "bank-transfer" } => ["alipay", "wechat", "bank-transfer"].includes(item.key)).map((item) => ({ key: item.key, enabled: item.enabled, configured: item.configured }))} /></div>;
}

function Metric({ icon: Icon, label, value }: { icon: typeof CircleDollarSign; label: string; value: string }) { return <section className="panel p-5"><Icon className="size-4 text-[var(--brand)]" /><span className="mt-5 block text-[10px] text-[var(--muted)]">{label}</span><strong className="mt-1 block text-2xl">{value}</strong></section>; }
