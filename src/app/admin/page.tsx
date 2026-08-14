import Link from "next/link";
import { Activity, ArrowRight, BadgeCheck, Boxes, Building2, CircleDollarSign, Landmark, Server, ShieldCheck, Users } from "lucide-react";
import { connection } from "next/server";
import { LocalTime } from "@/components/local-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
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
    prisma.paymentOrder.findMany({ where: { channel: { in: ["BANK_TRANSFER", "CODE_PAY"] }, status: "PENDING" }, include: { tenant: true, invoice: true }, orderBy: { createdAt: "asc" }, take: 5 }),
    prisma.requestLog.aggregate({ where: { occurredAt: { gte: recent } }, _avg: { latencyMs: true } }),
    prisma.requestLog.count({ where: { occurredAt: { gte: recent }, statusCode: { gte: 500 } } }),
    prisma.requestLog.count({ where: { occurredAt: { gte: recent } } }),
    prisma.provider.count(),
    prisma.provider.count({ where: { verifiedAt: { not: null } } }),
    prisma.tenant.count({ where: { status: "SUSPENDED" } }),
    prisma.invoice.aggregate({ where: { status: "ISSUED" }, _count: { _all: true }, _sum: { amount: true } }),
  ]);
  const errorRate = recentCalls ? (recentErrors / recentCalls) * 100 : 0;
  const metrics = [
    { label: "今日网关请求", value: todayCalls.toLocaleString("zh-CN"), note: "从今日 00:00 起", icon: Server, tone: "brand" },
    { label: "活跃租户", value: activeTenants.toLocaleString("zh-CN"), note: suspendedTenants ? `${suspendedTenants} 个已暂停` : "全部空间状态正常", icon: Users, tone: "aqua" },
    { label: "已发布 API", value: publishedApis.toLocaleString("zh-CN"), note: `${pendingApis.length} 个近期待处理`, icon: Boxes, tone: "accent" },
    { label: "本月实收", value: `¥ ${monthPaid._sum.amount?.toString() ?? "0"}`, note: `${outstanding._count._all} 张账单待支付`, icon: CircleDollarSign, tone: "warning" },
  ] as const;
  const taskCount = pendingPayments.length + pendingProviders.length + pendingApis.length;

  return <div className="page-shell space-y-5">
    <header className="ops-heading"><div><p className="eyebrow">PLATFORM OPERATIONS</p><h2>平台运营概览</h2><p><LocalTime value={now} dateOnly options={{ year: "numeric", month: "long", day: "numeric", weekday: "long" }} /> · 实时业务数据</p></div><div className="flex flex-wrap gap-2"><Button asChild variant="secondary" size="sm"><Link href="/admin/apis"><Boxes />管理 API</Link></Button><Button asChild size="sm"><Link href="/admin/payments"><Landmark />核销订单</Link></Button></div></header>

    <section className="ops-scoreboard" aria-label="平台核心指标">{metrics.map((item) => <OpsMetric key={item.label} {...item} />)}</section>

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_340px]">
      <section className="ops-queue"><header><div><span className="eyebrow">ACTION QUEUE</span><h3>运营待办</h3><p>按进入时间整理需要管理员介入的真实事项</p></div><Badge variant={taskCount ? "accent" : "success"}>{taskCount} 项</Badge></header><div className="ops-task-list">
        {pendingPayments.map((item) => <TaskRow key={item.id} href="/admin/payments" icon={Landmark} tone="warning" title={`核对 ¥${item.amount.toString()} 对公转账`} detail={<>{item.tenant.name} · {item.invoice?.period ?? "未关联账期"} · <LocalTime value={item.createdAt} /></>} action="核销" />)}
        {pendingProviders.map((item) => <TaskRow key={item.id} href="/admin/providers" icon={BadgeCheck} tone="aqua" title={`审核服务商：${item.name}`} detail={`${item.legalName} · ${item.contactEmail}`} action="审核" />)}
        {pendingApis.map((item) => <TaskRow key={item.id} href="/admin/apis" icon={Boxes} tone="brand" title={item.name} detail={<>{item.provider.name} · {item.status === "DRAFT" ? "草稿" : "审核中"} · <LocalTime value={item.updatedAt} /></>} action="处理" />)}
        {!taskCount && <EmptyState icon={ShieldCheck} title="当前没有运营待办" description="新的审核或核销事项会自动进入这里。" />}
      </div></section>

      <aside className="space-y-5">
        <section className="ops-live"><header><span className={errorRate >= 5 ? "is-alert" : ""} /><div><h3>网关实时状态</h3><p>最近 5 分钟请求窗口</p></div></header><div className="ops-live-grid"><Signal label="请求数" value={recentCalls.toLocaleString("zh-CN")} /><Signal label="平均延迟" value={recentLatency._avg.latencyMs == null ? "暂无" : `${Math.round(recentLatency._avg.latencyMs)} ms`} /><Signal label="5xx 错误率" value={`${errorRate.toFixed(2)}%`} alert={errorRate >= 5} /><Signal label="5xx 请求" value={recentErrors.toLocaleString("zh-CN")} alert={recentErrors > 0} /></div><Link href="/admin/monitor">查看网关监控<ArrowRight /></Link></section>
        <section className="ops-governance"><header><div><span className="eyebrow">GOVERNANCE</span><h3>平台治理</h3></div><Activity /></header><GovernanceRow icon={BadgeCheck} label="服务商认证" value={`${verifiedProviders} / ${providerCount}`} href="/admin/providers" /><GovernanceRow icon={Building2} label="活跃租户" value={activeTenants.toLocaleString("zh-CN")} href="/admin/tenants" /><GovernanceRow icon={CircleDollarSign} label="待收账款" value={`¥ ${outstanding._sum.amount?.toString() ?? "0"}`} href="/admin/payments" /></section>
      </aside>
    </div>
  </div>;
}

function OpsMetric({ label, value, note, icon: Icon, tone }: { label: string; value: string; note: string; icon: typeof Server; tone: "brand" | "aqua" | "accent" | "warning" }) { return <div className={`ops-metric tone-${tone}`}><div><span>{label}</span><strong>{value}</strong><small>{note}</small></div><Icon /></div>; }
function TaskRow({ href, icon: Icon, tone, title, detail, action }: { href: string; icon: typeof Boxes; tone: "brand" | "aqua" | "warning"; title: string; detail: React.ReactNode; action: string }) { return <div className={`ops-task tone-${tone}`}><span><Icon /></span><div><strong>{title}</strong><small>{detail}</small></div><Link href={href}>{action}<ArrowRight /></Link></div>; }
function Signal({ label, value, alert = false }: { label: string; value: string; alert?: boolean }) { return <div><span>{label}</span><strong className={alert ? "text-[var(--danger)]" : ""}>{value}</strong></div>; }
function GovernanceRow({ icon: Icon, label, value, href }: { icon: typeof BadgeCheck; label: string; value: string; href: string }) { return <Link href={href}><Icon /><span>{label}</span><strong>{value}</strong><ArrowRight /></Link>; }
