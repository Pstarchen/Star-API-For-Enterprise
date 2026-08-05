"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useSyncExternalStore } from "react";
import { usageSeries } from "@/lib/data";

export function UsageChart() {
  const mounted = useSyncExternalStore(() => () => undefined, () => true, () => false);

  if (!mounted) return <div className="h-[250px] w-full animate-pulse bg-[var(--surface-subtle)]" aria-label="正在加载调用趋势" />;

  return <div className="h-[250px] w-full"><ResponsiveContainer width="100%" height="100%"><AreaChart data={usageSeries} margin={{ top: 12, right: 6, left: -26, bottom: 0 }}><defs><linearGradient id="usageFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#08785d" stopOpacity={0.2} /><stop offset="95%" stopColor="#08785d" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="#e5e9e7" vertical={false} /><XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#7b8581" }} /><YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#7b8581" }} /><Tooltip contentStyle={{ border: "1px solid #dce2df", borderRadius: 4, fontSize: 11 }} /><Area type="monotone" dataKey="success" name="成功调用（万）" stroke="#08785d" strokeWidth={2} fill="url(#usageFill)" /><Area type="monotone" dataKey="failed" name="失败调用（万）" stroke="#b96c0a" strokeWidth={1.5} fill="transparent" /></AreaChart></ResponsiveContainer></div>;
}
