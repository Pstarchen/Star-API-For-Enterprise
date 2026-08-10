import { Activity, Braces, CheckCircle2, Clock3, Server, TimerReset, TriangleAlert } from "lucide-react";
import { connection } from "next/server";
import { UsageChart } from "@/components/usage-chart";
import { getApiOperationsStatistics } from "@/lib/server/api-statistics";

export default async function MonitorPage() {
  await connection();
  const statistics = await getApiOperationsStatistics();
  const metrics = [
    { icon: Braces, label: "API 总数", value: statistics.apiCount.toLocaleString("zh-CN"), detail: `${statistics.publishedApiCount} 个已发布` },
    { icon: Activity, label: "累计调用", value: statistics.totalCalls.toLocaleString("zh-CN"), detail: "来自真实网关日志" },
    { icon: CheckCircle2, label: "今日调用", value: statistics.todayCalls.toLocaleString("zh-CN"), detail: statistics.todaySuccessRate == null ? "暂无成功率" : `成功率 ${statistics.todaySuccessRate}%` },
    { icon: Clock3, label: "今日平均延迟", value: statistics.todayAverageLatency == null ? "暂无" : `${statistics.todayAverageLatency} ms`, detail: "成功与失败请求均计入" },
  ];
  return <div className="mx-auto max-w-[1440px] space-y-5">
    <div><p className="eyebrow">GATEWAY OBSERVABILITY</p><h2 className="mt-1 text-xl font-bold">API 运营与网关监控</h2><p className="mt-1 text-[11px] text-[var(--muted)]">累计、今日与实时窗口统一来自 RequestLog，不使用演示统计。</p></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map((item) => <Metric key={item.label} {...item} />)}</div>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,0.8fr)]">
      <section className="panel min-w-0 p-5"><div className="flex items-end justify-between gap-3"><div><h3 className="text-[13px] font-bold">最近 7 天调用趋势</h3><p className="mt-1 text-[9px] text-[var(--muted)]">按中国标准时间汇总成功与失败请求</p></div><span className="text-[9px] text-[var(--muted)]">单位：次</span></div><div className="mt-4"><UsageChart data={statistics.daily} /></div></section>
      <section className="panel overflow-hidden"><div className="border-b border-[var(--line)] px-5 py-4"><h3 className="text-[13px] font-bold">近 7 天热门 API</h3><p className="mt-1 text-[9px] text-[var(--muted)]">按真实调用量排序</p></div><div className="divide-y divide-[var(--line)]">{statistics.popular.map((api, index) => <div key={api.id} className="flex items-center gap-3 px-5 py-3"><span className="grid size-7 shrink-0 place-items-center rounded-[7px] bg-[var(--surface-subtle)] text-[9px] font-bold text-[var(--muted)]">{index + 1}</span><span className="size-2 rounded-full" style={{ backgroundColor: api.color }} /><div className="min-w-0 flex-1"><strong className="block truncate text-[10px]">{api.name}</strong><span className="mt-0.5 block truncate text-[8px] text-[var(--muted)]">/{api.slug} · {api.averageLatency == null ? "暂无延迟" : `${api.averageLatency} ms`}</span></div><strong className="text-[11px]">{api.calls.toLocaleString("zh-CN")}</strong></div>)}</div>{!statistics.popular.length && <div className="py-14 text-center text-[10px] text-[var(--muted)]">近 7 天暂无调用</div>}</section>
    </div>
    <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
      <section className="panel p-5"><div className="flex items-center justify-between"><div><h3 className="text-[13px] font-bold">最近 5 分钟</h3><p className="mt-1 text-[9px] text-[var(--muted)]">用于观察即时网关状态</p></div><TimerReset className="size-4 text-[var(--brand)]" /></div><div className="mt-5 grid grid-cols-3 gap-3"><WindowMetric label="请求数" value={statistics.windowCalls.toLocaleString("zh-CN")} /><WindowMetric label="平均延迟" value={statistics.windowAverageLatency == null ? "暂无" : `${statistics.windowAverageLatency} ms`} /><WindowMetric label="5xx 错误率" value={`${statistics.windowErrorRate}%`} danger={statistics.windowErrorRate > 0} /></div></section>
      <section className="panel overflow-hidden"><div className="border-b border-[var(--line)] px-5 py-4"><h3 className="text-[13px] font-bold">实时请求区域</h3></div><div className="grid gap-px bg-[var(--line)] sm:grid-cols-2">{statistics.regions.map((region) => <div key={region.name} className="bg-[var(--surface)] p-5"><div className="flex items-center gap-2 text-[11px] font-semibold"><Server className="size-4 text-[var(--brand)]" />{region.name}</div><div className="mt-4 grid grid-cols-2 text-[9px]"><span className="text-[var(--muted)]">请求数 <strong className="mt-1 block text-base text-[var(--ink)]">{region.calls}</strong></span><span className="text-[var(--muted)]">平均延迟 <strong className="mt-1 block text-base text-[var(--ink)]">{region.averageLatency == null ? "暂无" : `${region.averageLatency} ms`}</strong></span></div></div>)}</div>{!statistics.regions.length && <div className="py-12 text-center text-[10px] text-[var(--muted)]">窗口内暂无请求</div>}</section>
    </div>
  </div>;
}

function Metric({ icon: Icon, label, value, detail }: { icon: typeof Activity; label: string; value: string; detail: string }) {
  return <section className="panel p-5"><div className="flex items-center justify-between"><span className="text-[9px] text-[var(--muted)]">{label}</span><Icon className="size-4 text-[var(--brand)]" /></div><strong className="mt-4 block text-2xl">{value}</strong><span className="mt-1 block text-[8px] text-[var(--muted)]">{detail}</span></section>;
}

function WindowMetric({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return <div><span className="text-[8px] text-[var(--muted)]">{label}</span><strong className={`mt-1 block text-[14px] ${danger ? "text-[var(--danger)]" : ""}`}>{value}</strong>{danger && <TriangleAlert className="mt-2 size-3.5 text-[var(--danger)]" />}</div>;
}
