"use client";

import Link from "next/link";
import { ArrowRight, ArrowUpRight, BadgeCheck, Boxes, Gauge, LayoutGrid, List, Search, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import type { CatalogProduct } from "@/lib/catalog";
import { cn, getMethodClass } from "@/lib/utils";
import { ApiCard } from "@/components/api-card";

type Mode = "preview" | "full";

function ApiRow({ api }: { api: CatalogProduct }) {
  return <Link href={`/apis/${api.slug}`} className="group grid gap-4 rounded-[8px] border border-[var(--line)] bg-[var(--surface)] p-4 hover:border-[var(--line-strong)] hover:shadow-[var(--shadow-sm)] md:grid-cols-[minmax(0,1fr)_320px] md:items-center">
    <div className="flex min-w-0 gap-3.5"><span className="grid size-11 shrink-0 place-items-center rounded-[7px] text-[11px] font-bold text-white" style={{ background: api.color }}>{api.shortName}</span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-[14px] font-bold">{api.name}</h3>{api.verified && <BadgeCheck className="size-3.5 fill-[var(--brand)] text-white" />}<span className={cn("mono rounded-[4px] px-1.5 py-0.5 text-[9px] font-bold", getMethodClass(api.method))}>{api.method}</span><span className="rounded-[4px] bg-[var(--surface-subtle)] px-1.5 py-0.5 text-[9px] text-[var(--muted)]">{api.category}</span></div><p className="mt-1.5 line-clamp-2 text-[11px] leading-5 text-[var(--muted)]">{api.description}</p><p className="mt-1 text-[9px] text-[var(--muted)]">由 <strong className="text-[var(--ink)]">{api.provider}</strong> 提供</p></div></div>
    <div className="grid grid-cols-3 gap-2 border-t border-[var(--line)] pt-3 md:border-l md:border-t-0 md:pl-5 md:pt-0"><Metric label="平均响应" value={api.latency == null ? "暂无" : `${api.latency} ms`} icon={Gauge} /><Metric label="真实可用率" value={api.uptime == null ? "暂无" : `${api.uptime}%`} icon={ShieldCheck} /><span className="min-w-0"><small className="block text-[8px] text-[var(--muted)]">价格</small><strong className="mt-1 flex items-center justify-between gap-1 truncate text-[10px]">{api.price}<ArrowUpRight className="size-3 shrink-0" /></strong></span></div>
  </Link>;
}

function Metric({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Gauge }) { return <span><small className="block text-[8px] text-[var(--muted)]">{label}</small><strong className="mono mt-1 flex items-center gap-1 text-[10px]"><Icon className="size-3 text-[var(--brand)]" />{value}</strong></span>; }

export function ApiMarketplace({ products, mode = "preview" }: { products: CatalogProduct[]; mode?: Mode }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("全部");
  const [method, setMethod] = useState("全部");
  const [billing, setBilling] = useState("全部");
  const [sort, setSort] = useState("推荐");
  const [view, setView] = useState<"list" | "grid">("list");
  const categories = useMemo(() => ["全部", ...Array.from(new Set(products.map((api) => api.category)))], [products]);
  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return products.filter((api) => (category === "全部" || api.category === category) && (method === "全部" || api.method === method) && (billing === "全部" || (billing === "免费" ? api.billingMode === "FREE" : api.billingMode !== "FREE")) && (!keyword || [api.name, api.description, api.provider, api.endpoint, ...api.tags].join(" ").toLowerCase().includes(keyword))).sort((a, b) => sort === "调用最多" ? b.calls - a.calls : sort === "响应最快" ? (a.latency ?? Number.MAX_SAFE_INTEGER) - (b.latency ?? Number.MAX_SAFE_INTEGER) : Number(b.featured) - Number(a.featured));
  }, [billing, category, method, products, query, sort]);

  if (mode === "preview") {
    const featured = products.slice(0, 6);
    return <section className="container-shell py-10 sm:py-14"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="eyebrow">FEATURED API</p><h2 className="mt-2 text-2xl font-bold">已发布 API</h2><p className="mt-2 text-[12px] text-[var(--muted)]">展示管理员已发布并可真实调用的接口。</p></div><Link href="/marketplace" className="inline-flex h-9 items-center gap-2 rounded-[6px] border border-[var(--line)] px-3 text-[10px] font-semibold">查看 API 市场 <ArrowRight className="size-3.5" /></Link></div>{featured.length ? <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{featured.map((api) => <ApiCard key={api.id} api={api} />)}</div> : <EmptyState />}</section>;
  }

  return <div className="container-shell py-8"><div><p className="eyebrow">API MARKETPLACE</p><h1 className="mt-2 text-2xl font-bold">API 市场</h1><p className="mt-2 text-[12px] text-[var(--muted)]">共 {products.length} 个已发布接口，调用指标来自真实请求日志。</p></div><div className="mt-6 grid gap-5 lg:grid-cols-[210px_minmax(0,1fr)]"><aside className="space-y-1 lg:sticky lg:top-24 lg:self-start"><p className="mb-2 px-2 text-[9px] font-semibold text-[var(--muted)]">能力分类</p>{categories.map((item) => <button key={item} onClick={() => setCategory(item)} className={`flex h-9 w-full items-center justify-between rounded-[6px] px-3 text-[10px] ${category === item ? "bg-[var(--brand-soft)] font-semibold text-[var(--brand-strong)]" : "hover:bg-[var(--surface-subtle)]"}`}><span className="flex items-center gap-2"><Boxes className="size-3.5" />{item}</span><span>{item === "全部" ? products.length : products.filter((api) => api.category === item).length}</span></button>)}</aside><main className="min-w-0"><div className="flex flex-col gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface)] p-3 xl:flex-row"><label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-[6px] border border-[var(--line)] px-3"><Search className="size-3.5 text-[var(--muted)]" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 text-[10px] outline-none" placeholder="搜索名称、服务商、路径或标签" /></label><select value={method} onChange={(event) => setMethod(event.target.value)} className="h-9 rounded-[6px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[10px]"><option>全部</option><option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option></select><select value={billing} onChange={(event) => setBilling(event.target.value)} className="h-9 rounded-[6px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[10px]"><option>全部</option><option>免费</option><option>付费</option></select><select value={sort} onChange={(event) => setSort(event.target.value)} className="h-9 rounded-[6px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[10px]"><option>推荐</option><option>调用最多</option><option>响应最快</option></select><div className="flex rounded-[6px] border border-[var(--line)] p-0.5"><button onClick={() => setView("list")} className={`grid size-8 place-items-center rounded-[5px] ${view === "list" ? "bg-[var(--surface-subtle)]" : ""}`} title="列表视图"><List className="size-3.5" /></button><button onClick={() => setView("grid")} className={`grid size-8 place-items-center rounded-[5px] ${view === "grid" ? "bg-[var(--surface-subtle)]" : ""}`} title="网格视图"><LayoutGrid className="size-3.5" /></button></div></div><div className={view === "grid" ? "mt-3 grid gap-3 sm:grid-cols-2" : "mt-3 space-y-3"}>{filtered.map((api) => view === "grid" ? <ApiCard key={api.id} api={api} /> : <ApiRow key={api.id} api={api} />)}</div>{!filtered.length && <EmptyState />}</main></div></div>;
}

function EmptyState() { return <div className="mt-6 rounded-[8px] border border-dashed border-[var(--line-strong)] py-14 text-center"><Boxes className="mx-auto size-7 text-[var(--muted)]" /><p className="mt-3 text-[12px] font-semibold">暂无可用 API</p><p className="mt-1 text-[10px] text-[var(--muted)]">管理员发布真实接口后将在这里显示。</p></div>; }
