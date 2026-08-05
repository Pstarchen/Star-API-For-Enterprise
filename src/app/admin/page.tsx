import Link from "next/link";
import { Activity, ArrowRight, BadgeCheck, Boxes, Building2, CircleDollarSign, Landmark, Server, ShieldCheck, Users } from "lucide-react";
import { connection } from "next/server";
import { prisma } from "@/lib/server/prisma";

export default async function AdminPage() {
  await connection();
  const now = new Date();
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const month = new Date(now.getFullYear(), now.getMonth(), 1);
  const recent = new Date(now.getTime() - 5 * 60 * 1000);
  const [todayCalls, activeTenants, publishedApis, monthPaid, pendingApis, pendingProviders, pendingPayments, recentLatency, recentErrors, recentCalls, providerCount, verifiedProviders, suspendedTenants, outstanding] = await Promise.all([
    prisma.requestLog.count({ where: { occurredAt: { gte: today } } }),
    prisma.tenant.count({ where: { status: "ACTIVE" } }),
    prisma.apiProduct.count({ where: { status: "PUBLISHED" } }),
    prisma.paymentOrder.aggregate({ where: { status: "PAID", paidAt: { gte: month } }, _sum: { amount: true } }),
    prisma.apiProduct.findMany({ where: { status: { in: ["DRAFT", "REVIEW"] } }, include: { provider: true }, orderBy: { updatedAt: "desc" }, take: 5 }),
    prisma.provider.findMany({ where: { verifiedAt: null }, orderBy: { createdAt: "asc" }, take: 5 }),
    prisma.paymentOrder.findMany({ where: { channel: "BANK_TRANSFER", status: "PENDING" }, include: { tenant: true, invoice: true }, orderBy: { createdAt: "asc" }, take: 5 }),
    prisma.requestLog.aggregate({ where: { occurredAt: { gte: recent } }, _avg: { latencyMs: true } }),
    prisma.requestLog.count({ where: { occurredAt: { gte: recent }, statusCode: { gte: 500 } } }),
    prisma.requestLog.count({ where: { occurredAt: { gte: recent } } }),
    prisma.provider.count(),
    prisma.provider.count({ where: { verifiedAt: { not: null } } }),
    prisma.tenant.count({ where: { status: "SUSPENDED" } }),
    prisma.invoice.aggregate({ where: { status: "ISSUED" }, _count: { _all: true }, _sum: { amount: true } }),
  ]);
  const metrics = [
    { label: "今日网关请求", value: todayCalls.toLocaleString("zh-CN"), note: "从今日 00:00 起", icon: Server, tone: "brand" },
    { label: "活跃租户", value: activeTenants.toLocaleString("zh-CN"), note: suspendedTenants ? `${suspendedTenants} 个已暂停` : "全部空间状态正常", icon: Users, tone: "aqua" },
    { label: "已发布 API", value: publishedApis.toLocaleString("zh-CN"), note: `${pendingApis.length} 个近期待处理`, icon: Boxes, tone: "accent" },
    { label: "本月实收", value: `¥ ${monthPaid._sum.amount?.toString() ?? "0"}`, note: `${outstanding._count._all} 张账单待支付`, icon: CircleDollarSign, tone: "warning" },
  ] as const;
  const errorRate = recentCalls ? (recentErrors / recentCalls) * 100 : 0;

  return <div className="mx-auto max-w-[1440px] space-y-6">
    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="eyebrow">PLATFORM OPERATIONS</p><h2 className="mt-1 text-xl font-bold">平台运营概览</h2><p className="mt-1 text-[11px] text-[var(--muted)]">{now.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" })} · 实时业务数据</p></div><div className="flex flex-wrap gap-2"><QuickLink href="/admin/apis" icon={Boxes} label="管理 API" /><QuickLink href="/admin/payments" icon={Landmark} label="核销订单" primary /></div></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map((item) => <Metric key={item.label} {...item} />)}</div>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
      <section className="panel overflow-hidden"><div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4"><div><h3 className="text-[13px] font-bold">运营待办</h3><p className="mt-1 text-[10px] text-[var(--muted)]">按处理优先级汇总需要管理员介入的事项</p></div><span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[9px] font-semibold text-[var(--accent)]">{pendingPayments.length + pendingProviders.length + pendingApis.length} 项</span></div><div className="divide-y divide-[var(--line)]">
        {pendingPayments.map((item) => <TaskRow key={item.id} href="/admin/payments" icon={Landmark} tone="warning" title={`核对 ¥${item.amount.toString()} 对公转账`} detail={`${item.tenant.name} · ${item.invoice?.period ?? "未关联账期"} · ${item.createdAt.toLocaleString("zh-CN")}`} action="核销" />)}
        {pendingProviders.map((item) => <TaskRow key={item.id} href="/admin/providers" icon={BadgeCheck} tone="aqua" title={`审核服务商：${item.name}`} detail={`${item.legalName} · ${item.contactEmail}`} action="审核" />)}
        {pendingApis.map((item) => <TaskRow key={item.id} href="/admin/apis" icon={Boxes} tone="brand" title={item.name} detail={`${item.provider.name} · ${item.status === "DRAFT" ? "草稿" : "审核中"} · ${item.updatedAt.toLocaleString("zh-CN")}`} action="处理" />)}
        {!pendingPayments.length && !pendingProviders.length && !pendingApis.length && <div className="grid min-h-52 place-items-center px-6 text-center"><div><ShieldCheck className="mx-auto size-6 text-[var(--success)]" /><strong className="mt-3 block text-[12px]">当前没有运营待办</strong><p className="mt-1 text-[10px] text-[var(--muted)]">新的审核或核销事项会出现在这里。</p></div></div>}
      </div></section>
      <aside className="space-y-4">
        <section className="panel overflow-hidden"><div className="border-b border-[var(--line)] px-5 py-4"><div className="flex items-center gap-2"><span className={`live-signal size-2 rounded-full ${errorRate >= 5 ? "bg-[var(--danger)]" : "bg-[var(--success)]"}`} /><h3 className="text-[13px] font-bold">网关实时状态</h3></div><p className="mt-1 text-[10px] text-[var(--muted)]">最近 5 分钟请求窗口</p></div><div className="grid grid-cols-2 gap-px bg-[var(--line)]"><Signal label="请求数" value={recentCalls.toLocaleString("zh-CN")} /><Signal label="平均延迟" value={recentLatency._avg.latencyMs == null ? "暂无" : `${Math.round(recentLatency._avg.latencyMs)} ms`} /><Signal label="5xx 错误率" value={`${errorRate.toFixed(2)}%`} alert={errorRate >= 5} /><Signal label="5xx 请求" value={recentErrors.toLocaleString("zh-CN")} alert={recentErrors > 0} /></div><Link href="/admin/monitor" className="flex items-center justify-between border-t border-[var(--line)] px-5 py-3 text-[10px] font-semibold text-[var(--brand)]">查看网关监控 <ArrowRight className="size-3.5" /></Link></section>
        <section className="panel p-5"><div className="flex items-center justify-between"><h3 className="text-[13px] font-bold">平台治理</h3><Activity className="size-4 text-[var(--brand)]" /></div><div className="mt-4 space-y-4"><GovernanceRow icon={BadgeCheck} label="服务商认证" value={`${verifiedProviders} / ${providerCount}`} href="/admin/providers" /><GovernanceRow icon={Building2} label="活跃租户" value={activeTenants.toLocaleString("zh-CN")} href="/admin/tenants" /><GovernanceRow icon={CircleDollarSign} label="待收账款" value={`¥ ${outstanding._sum.amount?.toString() ?? "0"}`} href="/admin/payments" /></div></section>
      </aside>
    </div>
  </div>;
}

function Metric({ label, value, note, icon: Icon, tone }: { label: string; value: string; note: string; icon: typeof Server; tone: "brand" | "aqua" | "accent" | "warning" }) { const styles = { brand: "bg-[var(--brand-soft)] text-[var(--brand)]", aqua: "bg-[var(--aqua-soft)] text-[var(--aqua)]", accent: "bg-[var(--accent-soft)] text-[var(--accent)]", warning: "bg-[var(--warning-soft)] text-[var(--warning)]" }; return <section className="panel p-5"><div className="flex items-start justify-between"><span className="text-[10px] font-medium text-[var(--muted)]">{label}</span><span className={`grid size-9 place-items-center rounded-[8px] ${styles[tone]}`}><Icon className="size-4" /></span></div><strong className="mt-4 block text-2xl">{value}</strong><span className="mt-1 block text-[9px] text-[var(--muted)]">{note}</span></section>; }
function QuickLink({ href, icon: Icon, label, primary = false }: { href: string; icon: typeof Boxes; label: string; primary?: boolean }) { return <Link href={href} className={`inline-flex h-9 items-center gap-2 rounded-[8px] px-4 text-[10px] font-semibold ${primary ? "bg-[var(--brand)] text-white shadow-[0_8px_20px_color-mix(in_srgb,var(--brand)_24%,transparent)]" : "border border-[var(--line)] bg-[var(--surface)]"}`}><Icon className="size-3.5" />{label}</Link>; }
function TaskRow({ href, icon: Icon, tone, title, detail, action }: { href: string; icon: typeof Boxes; tone: "brand" | "aqua" | "warning"; title: string; detail: string; action: string }) { const styles = { brand: "bg-[var(--brand-soft)] text-[var(--brand)]", aqua: "bg-[var(--aqua-soft)] text-[var(--aqua)]", warning: "bg-[var(--warning-soft)] text-[var(--warning)]" }; return <div className="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-[var(--surface-subtle)]"><span className={`grid size-10 shrink-0 place-items-center rounded-[8px] ${styles[tone]}`}><Icon className="size-4" /></span><div className="min-w-0 flex-1"><strong className="block truncate text-[11px]">{title}</strong><span className="mt-1 block truncate text-[9px] text-[var(--muted)]">{detail}</span></div><Link href={href} className="inline-flex shrink-0 items-center gap-1 rounded-[7px] px-2 py-1.5 text-[9px] font-semibold text-[var(--brand)] hover:bg-[var(--brand-soft)]">{action}<ArrowRight className="size-3" /></Link></div>; }
function Signal({ label, value, alert = false }: { label: string; value: string; alert?: boolean }) { return <div className="bg-[var(--surface)] p-4"><span className="text-[9px] text-[var(--muted)]">{label}</span><strong className={`mt-1 block text-[15px] ${alert ? "text-[var(--danger)]" : ""}`}>{value}</strong></div>; }
function GovernanceRow({ icon: Icon, label, value, href }: { icon: typeof BadgeCheck; label: string; value: string; href: string }) { return <Link href={href} className="flex items-center gap-3 rounded-[8px] p-2 transition hover:bg-[var(--surface-subtle)]"><Icon className="size-4 text-[var(--brand)]" /><span className="flex-1 text-[10px] text-[var(--muted)]">{label}</span><strong className="text-[11px]">{value}</strong><ArrowRight className="size-3 text-[var(--muted)]" /></Link>; }
