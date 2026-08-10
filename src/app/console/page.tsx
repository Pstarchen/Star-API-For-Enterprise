import { Prisma } from "@prisma/client";
import Link from "next/link";
import { ArrowRight, CheckCircle2, CircleDollarSign, Clock3, KeyRound, TrendingUp } from "lucide-react";
import { connection } from "next/server";
import { UsageChart, type UsagePoint } from "@/components/usage-chart";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCurrentUser, getCurrentWorkspace } from "@/lib/server/auth";
import { chinaDateKey, chinaDayStart, chinaMonthStart } from "@/lib/server/api-statistics";
import { prisma } from "@/lib/server/prisma";

type DailyRow = { day: string; success: bigint; failed: bigint };

export default async function ConsolePage() {
  await connection();
  const user = await getCurrentUser();
  const workspace = user ? await getCurrentWorkspace(user) : null;
  if (!workspace) return <EmptyWorkspace />;
  const now = new Date();
  const today = chinaDayStart(now);
  const month = chinaMonthStart(now);
  const week = new Date(today); week.setDate(week.getDate() - 6);
  const where = { app: { tenantId: workspace.tenantId } } as const;
  const [todayCount, todaySuccess, latency, monthCost, activeSubscriptions, recent, daily] = await Promise.all([
    prisma.requestLog.count({ where: { ...where, occurredAt: { gte: today } } }),
    prisma.requestLog.count({ where: { ...where, occurredAt: { gte: today }, statusCode: { gte: 200, lt: 400 } } }),
    prisma.requestLog.aggregate({ where: { ...where, occurredAt: { gte: today } }, _avg: { latencyMs: true } }),
    prisma.requestLog.aggregate({ where: { ...where, occurredAt: { gte: month } }, _sum: { amount: true } }),
    prisma.subscription.count({ where: { app: { tenantId: workspace.tenantId }, status: "ACTIVE" } }),
    prisma.requestLog.findMany({ where, include: { app: true, product: true }, orderBy: { occurredAt: "desc" }, take: 8 }),
    prisma.$queryRaw<DailyRow[]>(Prisma.sql`SELECT to_char(r."occurredAt" + interval '8 hours', 'YYYY-MM-DD') AS day, COUNT(*) FILTER (WHERE r."statusCode" >= 200 AND r."statusCode" < 400) AS success, COUNT(*) FILTER (WHERE r."statusCode" < 200 OR r."statusCode" >= 400) AS failed FROM "RequestLog" r JOIN "Application" a ON a.id = r."appId" WHERE a."tenantId" = ${workspace.tenantId} AND r."occurredAt" >= ${week} GROUP BY 1 ORDER BY 1`),
  ]);
  const dailyMap = new Map(daily.map((item) => [item.day, item]));
  const series: UsagePoint[] = Array.from({ length: 7 }, (_, index) => { const date = new Date(week.getTime() + index * 24 * 60 * 60 * 1000); const key = chinaDateKey(date); const row = dailyMap.get(key); const [, monthNumber, dayNumber] = key.split("-"); return { date: `${Number(monthNumber)}/${Number(dayNumber)}`, success: Number(row?.success ?? 0), failed: Number(row?.failed ?? 0) }; });
  const successRate = todayCount ? `${((todaySuccess / todayCount) * 100).toFixed(2)}%` : "暂无";
  const metrics = [
    { label: "今日调用量", value: todayCount.toLocaleString("zh-CN"), note: "从今日 00:00 起", icon: TrendingUp, tone: "brand" },
    { label: "今日成功率", value: successRate, note: "基于真实状态码", icon: CheckCircle2, tone: "aqua" },
    { label: "今日平均响应", value: latency._avg.latencyMs == null ? "暂无" : `${Math.round(latency._avg.latencyMs)} ms`, note: "全部有效请求", icon: Clock3, tone: "accent" },
    { label: "本月调用费用", value: `¥ ${monthCost._sum.amount?.toString() ?? "0"}`, note: "按账期累计", icon: CircleDollarSign, tone: "warning" },
  ] as const;

  return <div className="page-shell space-y-5">
    <header className="ops-heading"><div><p className="eyebrow">WORKSPACE OVERVIEW</p><h2>工作空间概览</h2><p>{activeSubscriptions} 个有效 API 订阅，指标来自真实网关日志</p></div><div className="flex gap-2"><Button asChild variant="secondary" size="sm"><Link href="/console/apps"><KeyRound />管理应用</Link></Button><Button asChild size="sm"><Link href="/marketplace">添加 API<ArrowRight /></Link></Button></div></header>
    <section className="ops-scoreboard">{metrics.map((item) => <ConsoleMetric key={item.label} {...item} />)}</section>
    <section className="console-trend"><header><div><span className="eyebrow">REQUEST PULSE</span><h3>最近 7 天调用趋势</h3></div><span>单位：次</span></header><div><UsageChart data={series} /></div></section>
    <section className="console-activity"><header><div><span className="eyebrow">LATEST REQUESTS</span><h3>最近调用</h3></div><Link href="/console/logs">查看全部<ArrowRight /></Link></header><TableContainer><Table className="min-w-[760px]"><TableHeader><TableRow className="hover:bg-transparent"><TableHead>时间</TableHead><TableHead>API</TableHead><TableHead>应用</TableHead><TableHead>状态</TableHead><TableHead>耗时</TableHead><TableHead>费用</TableHead></TableRow></TableHeader><TableBody>{recent.map((log) => <TableRow key={log.id}><TableCell className="text-[var(--muted)]">{log.occurredAt.toLocaleString("zh-CN")}</TableCell><TableCell className="font-semibold">{log.product?.name ?? "已删除 API"}</TableCell><TableCell>{log.app.name}</TableCell><TableCell><span className={log.statusCode >= 200 && log.statusCode < 400 ? "text-[var(--success)]" : "text-[var(--danger)]"}>{log.statusCode}</span></TableCell><TableCell>{log.latencyMs} ms</TableCell><TableCell>¥{log.amount.toString()}</TableCell></TableRow>)}</TableBody></Table></TableContainer>{!recent.length && <EmptyState icon={TrendingUp} title="暂无调用日志" description="应用发起真实请求后会在这里出现。" />}</section>
  </div>;
}

function ConsoleMetric({ label, value, note, icon: Icon, tone }: { label: string; value: string; note: string; icon: typeof TrendingUp; tone: "brand" | "aqua" | "accent" | "warning" }) { return <div className={`ops-metric tone-${tone}`}><div><span>{label}</span><strong>{value}</strong><small>{note}</small></div><Icon /></div>; }
function EmptyWorkspace() { return <EmptyState icon={KeyRound} title="当前账号没有可用工作区" description="联系管理员加入企业，或创建一个新的个人空间。" className="rounded-[8px] border border-dashed border-[var(--line)]" />; }
