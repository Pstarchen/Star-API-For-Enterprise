import { CircleDollarSign, ReceiptText, Server } from "lucide-react";
import { connection } from "next/server";
import { LocalTime } from "@/components/local-time";
import { PaymentManager } from "@/components/payment-manager";
import { WalletRechargeManager } from "@/components/wallet-recharge-manager";
import { getCurrentUser, getCurrentWorkspace } from "@/lib/server/auth";
import { integrationSummaries } from "@/lib/server/integrations";
import { enabledPaymentProviderViews } from "@/lib/server/payment-providers";
import { prisma } from "@/lib/server/prisma";

const invoiceNames = { DRAFT: "草稿", ISSUED: "待支付", PAID: "已支付", VOID: "已作废" } as const;
const channelKeys = ["alipay", "wechat", "bank-transfer", "code-pay"] as const;
type ClientChannelKey = (typeof channelKeys)[number];

export default async function BillingPage() {
  await connection();
  const user = await getCurrentUser();
  const workspace = user ? await getCurrentWorkspace(user) : null;
  const month = new Date();
  month.setDate(1);
  month.setHours(0, 0, 0, 0);
  const [usage, calls, invoices, orders, wallet, walletEntries, integrations, paymentProviders] = workspace
    ? await Promise.all([
        prisma.requestLog.aggregate({ where: { app: { tenantId: workspace.tenantId }, occurredAt: { gte: month } }, _sum: { amount: true } }),
        prisma.requestLog.count({ where: { app: { tenantId: workspace.tenantId }, occurredAt: { gte: month } } }),
        prisma.invoice.findMany({ where: { tenantId: workspace.tenantId }, orderBy: { period: "desc" } }),
        prisma.paymentOrder.findMany({ where: { tenantId: workspace.tenantId }, orderBy: { createdAt: "desc" }, take: 100 }),
        prisma.tenant.findUnique({ where: { id: workspace.tenantId }, select: { balance: true } }),
        prisma.walletEntry.findMany({ where: { tenantId: workspace.tenantId }, orderBy: { createdAt: "desc" }, take: 100 }),
        integrationSummaries(),
        enabledPaymentProviderViews(),
      ])
    : [{ _sum: { amount: null } }, 0, [], [], null, [], [], []] as const;
  const outstanding = invoices.filter((item) => item.status === "ISSUED").reduce((sum, item) => sum + Number(item.amount), 0);
  const invoiceOrders = orders.filter((item) => item.orderType === "INVOICE");
  const rechargeOrders = orders.filter((item) => item.orderType === "RECHARGE");
  const clientChannels = integrations.flatMap((item) => channelKeys.includes(item.key as ClientChannelKey)
    ? [{ key: item.key as ClientChannelKey, enabled: item.enabled, configured: item.configured, publicConfig: item.publicConfig }]
    : []);
  const paymentChannels: { key: ClientChannelKey; enabled: boolean; configured: boolean; publicConfig: Record<string, unknown> }[] = clientChannels;

  return <div className="mx-auto max-w-[1200px] space-y-5">
    <div><p className="eyebrow">BILLING</p><h2 className="mt-1 text-xl font-bold">账单与账户余额</h2><p className="mt-1 text-[11px] text-[var(--muted)]">用量费用来自真实网关调用记录，充值和退款都会生成可追溯的钱包流水。</p></div>
    <div className="grid gap-3 sm:grid-cols-4"><Metric icon={WalletIcon} label="账户余额" value={`¥${wallet?.balance.toString() ?? "0.00"}`} /><Metric icon={CircleDollarSign} label="本月调用费用" value={`¥${usage._sum.amount?.toString() ?? "0"}`} /><Metric icon={Server} label="本月调用量" value={`${calls.toLocaleString("zh-CN")} 次`} /><Metric icon={ReceiptText} label="待支付账单" value={`¥${outstanding.toFixed(2)}`} /></div>
    <WalletRechargeManager balance={wallet?.balance.toString() ?? "0.00"} entries={walletEntries.map((entry) => ({ id: entry.id, type: entry.type, delta: entry.delta.toString(), balanceAfter: entry.balanceAfter.toString(), reason: entry.reason, createdAt: entry.createdAt.toISOString() }))} orders={rechargeOrders.map((order) => ({ id: order.id, orderNo: order.orderNo, channel: order.channel, providerName: order.providerNameSnapshot, paymentType: order.paymentType, status: order.status, amount: order.amount.toString(), createdAt: order.createdAt.toISOString(), paidAt: order.paidAt?.toISOString() ?? null }))} channels={paymentChannels} paymentProviders={paymentProviders} />
    <section className="panel overflow-hidden"><div className="border-b border-[var(--line)] px-5 py-4"><h3 className="text-[13px] font-bold">月度账单</h3></div><div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-[10px]"><thead className="bg-[var(--surface-subtle)] text-[var(--muted)]"><tr><th className="px-5 py-3">账期</th><th className="px-5 py-3">金额</th><th className="px-5 py-3">状态</th><th className="px-5 py-3">出账时间</th></tr></thead><tbody className="divide-y divide-[var(--line)]">{invoices.map((invoice) => <tr key={invoice.id}><td className="px-5 py-4 font-semibold">{invoice.period}</td><td className="px-5 py-4">¥{invoice.amount.toString()}</td><td className="px-5 py-4">{invoiceNames[invoice.status]}</td><td className="px-5 py-4 text-[var(--muted)]">{invoice.issuedAt ? <LocalTime value={invoice.issuedAt} /> : "尚未出账"}</td></tr>)}</tbody></table></div>{!invoices.length && <div className="py-14 text-center text-[10px] text-[var(--muted)]">暂无正式账单</div>}</section>
    <PaymentManager invoices={invoices.filter((item) => item.status === "ISSUED").map((item) => ({ id: item.id, period: item.period, amount: item.amount.toString() }))} initialOrders={invoiceOrders.map((item) => ({ id: item.id, orderNo: item.orderNo, channel: item.channel, providerName: item.providerNameSnapshot, paymentType: item.paymentType, status: item.status, amount: item.amount.toString(), createdAt: item.createdAt.toISOString(), paidAt: item.paidAt?.toISOString() ?? null }))} channels={paymentChannels} paymentProviders={paymentProviders} />
  </div>;
}

function WalletIcon() { return <WalletMark />; }
function WalletMark() { return <CircleDollarSign className="size-4 text-[var(--brand)]" />; }
function Metric({ icon: Icon, label, value }: { icon: typeof CircleDollarSign | typeof WalletIcon; label: string; value: string }) { return <section className="panel p-5"><Icon /><span className="mt-5 block text-[10px] text-[var(--muted)]">{label}</span><strong className="mt-1 block text-2xl">{value}</strong></section>; }
