import { Prisma } from "@prisma/client";
import Link from "next/link";
import { ArrowRight, CheckCircle2, CircleDollarSign, Clock3, KeyRound, TrendingUp } from "lucide-react";
import { connection } from "next/server";
import { UsageChart, type UsagePoint } from "@/components/usage-chart";
import { getCurrentUser, getCurrentWorkspace } from "@/lib/server/auth";
import { prisma } from "@/lib/server/prisma";

type DailyRow = { day: Date; success: bigint; failed: bigint };

export default async function ConsolePage() {
  await connection();
  const user = await getCurrentUser();
  const workspace = user ? await getCurrentWorkspace(user) : null;
  if (!workspace) return <EmptyWorkspace />;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const month = new Date(now.getFullYear(), now.getMonth(), 1);
  const week = new Date(today); week.setDate(week.getDate() - 6);
  const where = { app: { tenantId: workspace.tenantId } } as const;
  const [todayCount, todaySuccess, latency, monthCost, activeSubscriptions, recent, daily] = await Promise.all([
    prisma.requestLog.count({ where: { ...where, occurredAt: { gte: today } } }),
    prisma.requestLog.count({ where: { ...where, occurredAt: { gte: today }, statusCode: { gte: 200, lt: 400 } } }),
    prisma.requestLog.aggregate({ where: { ...where, occurredAt: { gte: today } }, _avg: { latencyMs: true } }),
    prisma.requestLog.aggregate({ where: { ...where, occurredAt: { gte: month } }, _sum: { amount: true } }),
    prisma.subscription.count({ where: { app: { tenantId: workspace.tenantId }, status: "ACTIVE" } }),
    prisma.requestLog.findMany({ where, include: { app: true, product: true }, orderBy: { occurredAt: "desc" }, take: 8 }),
    prisma.$queryRaw<DailyRow[]>(Prisma.sql`SELECT date_trunc('day', r."occurredAt") AS day, COUNT(*) FILTER (WHERE r."statusCode" >= 200 AND r."statusCode" < 400) AS success, COUNT(*) FILTER (WHERE r."statusCode" < 200 OR r."statusCode" >= 400) AS failed FROM "RequestLog" r JOIN "Application" a ON a.id = r."appId" WHERE a."tenantId" = ${workspace.tenantId} AND r."occurredAt" >= ${week} GROUP BY 1 ORDER BY 1`),
  ]);
  const dailyMap = new Map(daily.map((item) => [item.day.toISOString().slice(0, 10), item]));
  const series: UsagePoint[] = Array.from({ length: 7 }, (_, index) => { const date = new Date(week); date.setDate(week.getDate() + index); const key = date.toISOString().slice(0, 10); const row = dailyMap.get(key); return { date: `${date.getMonth() + 1}/${date.getDate()}`, success: Number(row?.success ?? 0), failed: Number(row?.failed ?? 0) }; });
  const successRate = todayCount ? `${((todaySuccess / todayCount) * 100).toFixed(2)}%` : "暂无";
  const metrics = [
    { label: "今日调用量", value: todayCount.toLocaleString("zh-CN"), icon: TrendingUp },
    { label: "今日成功率", value: successRate, icon: CheckCircle2 },
    { label: "今日平均响应", value: latency._avg.latencyMs == null ? "暂无" : `${Math.round(latency._avg.latencyMs)} ms`, icon: Clock3 },
    { label: "本月调用费用", value: `¥ ${monthCost._sum.amount?.toString() ?? "0"}`, icon: CircleDollarSign },
  ];
  return <div className="mx-auto max-w-[1440px] space-y-6"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="eyebrow">WORKSPACE OVERVIEW</p><h2 className="mt-1 text-xl font-bold">工作空间概览</h2><p className="mt-1 text-[11px] text-[var(--muted)]">{activeSubscriptions} 个有效 API 订阅，指标来自真实网关日志。</p></div><div className="flex gap-2"><Link href="/console/apps" className="inline-flex h-9 items-center gap-2 rounded-[6px] border border-[var(--line)] px-3 text-[10px] font-semibold"><KeyRound className="size-3.5" />管理应用</Link><Link href="/marketplace" className="inline-flex h-9 items-center gap-2 rounded-[6px] bg-[var(--brand)] px-3 text-[10px] font-semibold text-white">添加 API <ArrowRight className="size-3" /></Link></div></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map((item) => <section key={item.label} className="panel p-4"><div className="flex justify-between"><span className="text-[10px] text-[var(--muted)]">{item.label}</span><item.icon className="size-4 text-[var(--brand)]" /></div><strong className="mt-4 block text-2xl">{item.value}</strong></section>)}</div><section className="panel min-w-0 p-5"><h3 className="text-[13px] font-bold">最近 7 天调用趋势</h3><p className="mt-1 text-[9px] text-[var(--muted)]">单位：次</p><div className="mt-4"><UsageChart data={series} /></div></section><section className="panel overflow-hidden"><div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4"><h3 className="text-[13px] font-bold">最近调用</h3><Link href="/console/logs" className="text-[10px] font-semibold text-[var(--brand)]">查看全部</Link></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-[10px]"><thead className="bg-[var(--surface-subtle)] text-[var(--muted)]"><tr><th className="px-5 py-3">时间</th><th className="px-5 py-3">API</th><th className="px-5 py-3">应用</th><th className="px-5 py-3">状态</th><th className="px-5 py-3">耗时</th><th className="px-5 py-3">费用</th></tr></thead><tbody className="divide-y divide-[var(--line)]">{recent.map((log) => <tr key={log.id}><td className="px-5 py-3 text-[var(--muted)]">{log.occurredAt.toLocaleString("zh-CN")}</td><td className="px-5 py-3">{log.product?.name ?? "已删除 API"}</td><td className="px-5 py-3">{log.app.name}</td><td className="px-5 py-3">{log.statusCode}</td><td className="px-5 py-3">{log.latencyMs} ms</td><td className="px-5 py-3">¥{log.amount.toString()}</td></tr>)}</tbody></table></div>{!recent.length && <div className="py-12 text-center text-[10px] text-[var(--muted)]">暂无调用日志</div>}</section></div>;
}

function EmptyWorkspace() { return <div className="rounded-[8px] border border-dashed border-[var(--line)] py-16 text-center"><p className="text-[12px] font-semibold">当前账号没有可用工作区</p></div>; }
