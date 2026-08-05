import Link from "next/link";
import { ArrowUpRight, BadgeCheck, Gauge, ShieldCheck } from "lucide-react";
import type { ApiProduct } from "@/lib/types";
import { cn, getMethodClass } from "@/lib/utils";

export function ApiCard({ api }: { api: ApiProduct }) {
  return (
    <Link
      href={`/apis/${api.slug}`}
      className="group flex min-h-[258px] flex-col rounded-[6px] border border-[var(--line)] bg-[var(--surface)] p-5 transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-[var(--line-strong)] hover:shadow-[var(--shadow-md)] focus-visible:relative"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-[6px] text-[13px] font-bold text-white shadow-sm" style={{ backgroundColor: api.color }}>
          {api.shortName}
        </span>
        <ArrowUpRight className="size-4 text-[var(--line-strong)] transition group-hover:text-[var(--brand)]" />
      </div>
      <div className="mt-4 flex items-center gap-1.5">
        <h3 className="text-[15px] font-bold text-[var(--ink)]">{api.name}</h3>
        {api.verified && <BadgeCheck className="size-4 fill-[var(--brand)] text-white" aria-label="企业认证服务" />}
      </div>
      <p className="mt-1 text-[9px] text-[var(--muted)]">{api.provider} · {api.category}</p>
      <p className="mt-2 line-clamp-2 min-h-10 text-[13px] leading-5 text-[var(--muted)]">{api.description}</p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        <span className={cn("mono rounded-[4px] px-2 py-1 text-[10px] font-bold", getMethodClass(api.method))}>{api.method}</span>
        {api.tags.slice(0, 2).map((tag) => (
          <span key={tag} className="rounded-[4px] bg-[var(--surface-subtle)] px-2 py-1 text-[10px] text-[var(--muted)]">{tag}</span>
        ))}
      </div>
      <div className="mt-auto grid grid-cols-3 gap-2 border-t border-[var(--line)] pt-4 text-[11px]">
        <span className="flex items-center gap-1 text-[var(--muted)]"><Gauge className="size-3" /> {api.latency}ms</span>
        <span className="flex items-center gap-1 text-[var(--muted)]"><ShieldCheck className="size-3" /> {api.uptime}%</span>
        <strong className="truncate text-right font-semibold text-[var(--ink)]">{api.price}</strong>
      </div>
    </Link>
  );
}
