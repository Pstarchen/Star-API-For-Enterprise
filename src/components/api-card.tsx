import Link from "next/link";
import { ArrowUpRight, BadgeCheck, Gauge, ShieldCheck } from "lucide-react";
import type { CatalogProduct } from "@/lib/catalog";
import { Badge } from "./ui/badge";
import { cn, getMethodClass } from "@/lib/utils";

export function ApiCard({ api }: { api: CatalogProduct }) {
  return <Link href={`/apis/${api.slug}`} className="group flex min-h-64 flex-col rounded-[8px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-xs)] transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-[var(--brand-line)] hover:shadow-[var(--shadow-md)]">
    <div className="flex items-center justify-between gap-3"><span className={cn("mono inline-flex h-5 items-center rounded-full px-2 text-[11px] font-bold", getMethodClass(api.method))}>{api.method}</span><span className="grid size-8 place-items-center rounded-[7px] text-[var(--muted)] transition group-hover:bg-[var(--brand-soft)] group-hover:text-[var(--brand)]"><ArrowUpRight className="size-4" /></span></div>
    <div className="mt-4 flex items-center gap-1.5"><h3 className="truncate text-[15px] font-bold">{api.name}</h3>{api.verified && <BadgeCheck className="size-3.5 fill-[var(--brand)] text-white" aria-label="已认证服务商" />}</div>
    <p className="mt-2 line-clamp-2 text-[13px] leading-5 text-[var(--muted)]">{api.description}</p>
    <div className="mt-3 flex flex-wrap gap-1.5"><Badge>{api.category}</Badge></div>
    <div className="mt-auto grid grid-cols-2 gap-3 border-t border-[var(--line)] pt-3 text-xs"><span><small className="block text-[var(--muted)]">平均响应</small><strong className="mt-1 flex items-center gap-1"><Gauge className="size-3 text-[var(--aqua)]" />{api.latency == null ? "暂无" : `${api.latency} ms`}</strong></span><span><small className="block text-[var(--muted)]">真实可用率</small><strong className="mt-1 flex items-center gap-1"><ShieldCheck className="size-3 text-[var(--success)]" />{api.uptime == null ? "暂无" : `${api.uptime}%`}</strong></span></div>
    <div className="mt-3 flex items-center justify-between text-xs"><span className="text-[var(--muted)]">{api.calls.toLocaleString("zh-CN")} 次调用</span><strong className="text-[var(--ink)]">{api.price}</strong></div>
  </Link>;
}
