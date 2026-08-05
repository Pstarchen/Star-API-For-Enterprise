import { Activity, Server, TimerReset, TriangleAlert } from "lucide-react";
import { connection } from "next/server";
import { prisma } from "@/lib/server/prisma";

export default async function MonitorPage() {
  await connection();
  const now = new Date();
  const since = new Date(now.getTime() - 5 * 60 * 1000);
  const [count, latency, errors, regions] = await Promise.all([
    prisma.requestLog.count({ where: { occurredAt: { gte: since } } }),
    prisma.requestLog.aggregate({ where: { occurredAt: { gte: since } }, _avg: { latencyMs: true } }),
    prisma.requestLog.count({ where: { occurredAt: { gte: since }, statusCode: { gte: 500 } } }),
    prisma.requestLog.groupBy({ by: ["region"], where: { occurredAt: { gte: since } }, _count: { _all: true }, _avg: { latencyMs: true }, orderBy: { _count: { region: "desc" } } }),
  ]);
  const errorRate = count ? `${((errors / count) * 100).toFixed(2)}%` : "0%";
  return <div className="mx-auto max-w-[1200px] space-y-5"><div><p className="eyebrow">GATEWAY OBSERVABILITY</p><h2 className="mt-1 text-xl font-bold">网关监控</h2><p className="mt-1 text-[11px] text-[var(--muted)]">最近 5 分钟真实请求窗口。</p></div><div className="grid gap-3 sm:grid-cols-3"><Metric icon={Activity} label="窗口请求数" value={count.toLocaleString("zh-CN")} /><Metric icon={TimerReset} label="平均延迟" value={latency._avg.latencyMs == null ? "暂无" : `${Math.round(latency._avg.latencyMs)} ms`} /><Metric icon={TriangleAlert} label="5xx 错误率" value={errorRate} /></div><section className="panel overflow-hidden"><div className="border-b border-[var(--line)] px-5 py-4"><h3 className="text-[13px] font-bold">请求区域</h3></div><div className="grid gap-px bg-[var(--line)] sm:grid-cols-2">{regions.map((region) => <div key={region.region} className="bg-[var(--surface)] p-5"><div className="flex items-center gap-2 text-[11px] font-semibold"><Server className="size-4 text-[var(--brand)]" />{region.region}</div><div className="mt-4 grid grid-cols-2 text-[10px]"><span>请求数 <strong className="block text-base">{region._count._all}</strong></span><span>平均延迟 <strong className="block text-base">{region._avg.latencyMs == null ? "暂无" : `${Math.round(region._avg.latencyMs)} ms`}</strong></span></div></div>)}</div>{!regions.length && <div className="py-14 text-center text-[10px] text-[var(--muted)]">窗口内暂无请求</div>}</section></div>;
}

function Metric({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: string }) { return <section className="panel p-5"><Icon className="size-4 text-[var(--brand)]" /><span className="mt-4 block text-[9px] text-[var(--muted)]">{label}</span><strong className="mt-1 block text-2xl">{value}</strong></section>; }
