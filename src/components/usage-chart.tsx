"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useSyncExternalStore } from "react";

export type UsagePoint = { date: string; success: number; failed: number };

export function UsageChart({ data }: { data: UsagePoint[] }) {
  const mounted = useSyncExternalStore(() => () => undefined, () => true, () => false);
  if (!mounted) return <div className="h-[250px] w-full animate-pulse rounded-[6px] bg-[var(--surface-subtle)]" aria-label="正在加载调用趋势" />;
  if (!data.some((item) => item.success || item.failed)) return <div className="grid h-[250px] place-items-center text-center"><div><p className="text-[11px] font-semibold">暂无调用数据</p><p className="mt-1 text-[9px] text-[var(--muted)]">真实网关请求产生后将在这里显示趋势。</p></div></div>;
  return <div className="h-[250px] w-full"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{ top: 12, right: 6, left: -20, bottom: 0 }}><defs><linearGradient id="usageFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#08785d" stopOpacity={0.2} /><stop offset="95%" stopColor="#08785d" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="var(--line)" vertical={false} /><XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#7b8581" }} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#7b8581" }} /><Tooltip contentStyle={{ border: "1px solid var(--line)", borderRadius: 6, fontSize: 11 }} /><Area type="monotone" dataKey="success" name="成功调用" stroke="#08785d" strokeWidth={2} fill="url(#usageFill)" /><Area type="monotone" dataKey="failed" name="失败调用" stroke="#b96c0a" strokeWidth={1.5} fill="transparent" /></AreaChart></ResponsiveContainer></div>;
}
