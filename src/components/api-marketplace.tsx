"use client";

import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Boxes,
  Building2,
  CloudSun,
  Fingerprint,
  Gauge,
  LayoutGrid,
  List,
  MapPin,
  MessageSquare,
  ScanText,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { apiProducts, categories } from "@/lib/data";
import type { ApiCategory, ApiProduct } from "@/lib/types";
import { cn, getMethodClass } from "@/lib/utils";
import { ApiCard } from "./api-card";

type MarketplaceMode = "preview" | "full";
type BillingFilter = "全部" | "免费" | "付费";
type MethodFilter = "全部" | "GET" | "POST";
type ViewMode = "list" | "grid";

const categoryIcons = {
  全部: Boxes,
  身份核验: Fingerprint,
  企业数据: Building2,
  智能识别: ScanText,
  位置服务: MapPin,
  消息通信: MessageSquare,
  生活服务: CloudSun,
} satisfies Record<ApiCategory, typeof Boxes>;

function callsValue(calls: string) {
  const value = Number.parseFloat(calls.replaceAll(",", ""));
  if (calls.includes("亿")) return value * 100_000_000;
  if (calls.includes("万")) return value * 10_000;
  return value;
}

function ApiListRow({ api }: { api: ApiProduct }) {
  return (
    <Link href={`/apis/${api.slug}`} className="group grid min-h-28 gap-4 rounded-[6px] border border-[var(--line)] bg-[var(--surface)] p-4 transition-[border-color,box-shadow] hover:border-[var(--line-strong)] hover:shadow-[var(--shadow-sm)] md:grid-cols-[minmax(0,1fr)_320px] md:items-center">
      <div className="flex min-w-0 gap-3.5">
        <span className="grid size-11 shrink-0 place-items-center rounded-[6px] text-[12px] font-bold text-white shadow-sm" style={{ backgroundColor: api.color }}>{api.shortName}</span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-[14px] font-bold">{api.name}</h3>
            {api.verified && <BadgeCheck className="size-3.5 fill-[var(--brand)] text-white" aria-label="已认证服务" />}
            <span className={cn("mono rounded-[4px] px-1.5 py-0.5 text-[9px] font-bold", getMethodClass(api.method))}>{api.method}</span>
            <span className="rounded-[4px] bg-[var(--surface-subtle)] px-1.5 py-0.5 text-[9px] text-[var(--muted)]">{api.category}</span>
          </div>
          <p className="mt-1.5 line-clamp-2 text-[11px] leading-5 text-[var(--muted)]">{api.description}</p>
          <p className="mt-1 text-[9px] text-[var(--muted)]">由 <strong className="font-semibold text-[var(--ink)]">{api.provider}</strong> 提供</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 border-t border-[var(--line)] pt-3 md:border-l md:border-t-0 md:pl-5 md:pt-0">
        <span><small className="block text-[8px] text-[var(--muted)]">响应延迟</small><strong className="mono mt-1 flex items-center gap-1 text-[10px]"><Gauge className="size-3 text-[var(--aqua)]" />{api.latency} ms</strong></span>
        <span><small className="block text-[8px] text-[var(--muted)]">可用率</small><strong className="mono mt-1 flex items-center gap-1 text-[10px]"><ShieldCheck className="size-3 text-[var(--success)]" />{api.uptime}%</strong></span>
        <span className="min-w-0"><small className="block text-[8px] text-[var(--muted)]">参考价格</small><strong className="mt-1 flex items-center justify-between gap-1 truncate text-[10px]">{api.price}<ArrowUpRight className="size-3 shrink-0 text-[var(--line-strong)] group-hover:text-[var(--brand)]" /></strong></span>
      </div>
    </Link>
  );
}

export function ApiMarketplace({ mode = "preview" }: { mode?: MarketplaceMode }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ApiCategory>("全部");
  const [method, setMethod] = useState<MethodFilter>("全部");
  const [billing, setBilling] = useState<BillingFilter>("全部");
  const [sort, setSort] = useState("推荐排序");
  const [view, setView] = useState<ViewMode>("list");

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const result = apiProducts.filter((api) => {
      const inCategory = category === "全部" || api.category === category;
      const inMethod = method === "全部" || api.method === method;
      const isFree = api.price.includes("免费");
      const inBilling = billing === "全部" || (billing === "免费" ? isFree : !isFree);
      const inQuery = !normalized || [api.name, api.description, api.provider, api.endpoint, ...api.tags].join(" ").toLowerCase().includes(normalized);
      return inCategory && inMethod && inBilling && inQuery;
    });
    return [...result].sort((a, b) => {
      if (sort === "响应最快") return a.latency - b.latency;
      if (sort === "调用最多") return callsValue(b.calls) - callsValue(a.calls);
      if (sort === "可用率最高") return b.uptime - a.uptime;
      return Number(Boolean(b.featured)) - Number(Boolean(a.featured));
    });
  }, [billing, category, method, query, sort]);

  if (mode === "preview") {
    const featured = [...apiProducts].sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured))).slice(0, 6);
    return (
      <section className="container-shell py-10 sm:py-14" aria-labelledby="featured-api-heading">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="eyebrow">FEATURED API</p>
            <h2 id="featured-api-heading" className="mt-2 text-2xl font-bold">常用能力，接入即用</h2>
            <p className="mt-2 text-[12px] leading-6 text-[var(--muted)]">精选高可用接口，统一鉴权、账单与服务等级。</p>
          </div>
          <Link href="/marketplace" className="inline-flex h-9 items-center gap-2 self-start rounded-[5px] border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-[10px] font-semibold hover:border-[var(--brand)] sm:self-auto">查看全部 {apiProducts.length} 个接口 <ArrowRight className="size-3.5" /></Link>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((api) => <ApiCard key={api.id} api={api} />)}
        </div>
      </section>
    );
  }

  const clearFilters = () => {
    setQuery("");
    setCategory("全部");
    setMethod("全部");
    setBilling("全部");
  };

  return (
    <section className="container-shell py-8 sm:py-10" aria-labelledby="market-heading">
      <div>
        <p className="eyebrow">API MARKETPLACE / {apiProducts.length} SERVICES</p>
        <h1 id="market-heading" className="mt-2 text-3xl font-bold">API 市场</h1>
        <p className="mt-2 text-[12px] leading-6 text-[var(--muted)]">发现适合个人产品与企业系统的开放接口，在统一网关中完成试用、订阅与治理。</p>
      </div>

      <div className="mt-7 grid gap-5 lg:grid-cols-[210px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-28 lg:self-start" aria-label="接口筛选">
          <div className="rounded-[6px] border border-[var(--line)] bg-[var(--surface)] p-2">
            <p className="px-2 pb-2 pt-1 text-[9px] font-semibold text-[var(--muted)]">接口分类</p>
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-4 lg:grid-cols-1">
              {categories.map((item) => {
                const Icon = categoryIcons[item];
                const count = item === "全部" ? apiProducts.length : apiProducts.filter((api) => api.category === item).length;
                return <button key={item} type="button" onClick={() => setCategory(item)} className={cn("flex h-9 min-w-0 items-center gap-2 rounded-[5px] px-2.5 text-left text-[10px] text-[var(--muted)] hover:bg-[var(--surface-subtle)] hover:text-[var(--ink)]", category === item && "bg-[var(--brand-soft)] font-semibold text-[var(--brand)]")}><Icon className="size-3.5 shrink-0" /><span className="truncate">{item}</span><span className="mono ml-auto text-[8px] opacity-65">{count}</span></button>;
              })}
            </div>
            <div className="mt-2 border-t border-[var(--line)] px-2 pb-1 pt-3">
              <p className="mb-2 text-[9px] font-semibold text-[var(--muted)]">计费方式</p>
              <div className="grid grid-cols-3 gap-1 lg:grid-cols-1">{(["全部", "免费", "付费"] as BillingFilter[]).map((item) => <button key={item} type="button" onClick={() => setBilling(item)} className={cn("h-8 rounded-[4px] px-2 text-left text-[10px] text-[var(--muted)] hover:bg-[var(--surface-subtle)]", billing === item && "bg-[var(--surface-subtle)] font-semibold text-[var(--ink)]")}>{item}</button>)}</div>
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          <div className="rounded-[6px] border border-[var(--line)] bg-[var(--surface)] p-3">
            <label className="flex h-11 w-full items-center gap-2 border-b border-[var(--line)] px-1 focus-within:border-[var(--brand)]">
              <Search className="size-4 text-[var(--muted)]" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-[12px] outline-none" placeholder="搜索 API 名称、能力、路径或供应商" aria-label="搜索 API" />
              {query && <button type="button" onClick={() => setQuery("")} className="grid size-7 place-items-center text-[var(--muted)]" aria-label="清空搜索"><X className="size-3.5" /></button>}
            </label>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1" aria-label="请求方法筛选">{(["全部", "GET", "POST"] as MethodFilter[]).map((item) => <button key={item} type="button" onClick={() => setMethod(item)} className={cn("h-8 rounded-[4px] px-3 text-[9px] font-semibold text-[var(--muted)] hover:bg-[var(--surface-subtle)]", method === item && "bg-[var(--night)] text-white")}>{item}</button>)}</div>
              <label className="ml-auto flex h-8 items-center gap-2 text-[9px] text-[var(--muted)]"><SlidersHorizontal className="size-3.5" /><select value={sort} onChange={(event) => setSort(event.target.value)} className="bg-transparent font-medium text-[var(--ink)] outline-none"><option>推荐排序</option><option>响应最快</option><option>调用最多</option><option>可用率最高</option></select></label>
              <div className="flex h-8 items-center rounded-[5px] bg-[var(--surface-subtle)] p-0.5" aria-label="显示方式">
                <button type="button" onClick={() => setView("list")} className={cn("grid size-7 place-items-center rounded-[4px] text-[var(--muted)]", view === "list" && "bg-[var(--surface)] text-[var(--ink)] shadow-sm")} aria-label="列表视图" title="列表视图"><List className="size-3.5" /></button>
                <button type="button" onClick={() => setView("grid")} className={cn("grid size-7 place-items-center rounded-[4px] text-[var(--muted)]", view === "grid" && "bg-[var(--surface)] text-[var(--ink)] shadow-sm")} aria-label="网格视图" title="网格视图"><LayoutGrid className="size-3.5" /></button>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between text-[9px] text-[var(--muted)]"><span>找到 <strong className="font-semibold text-[var(--ink)]">{filtered.length}</strong> 个接口</span><span>服务状态实时更新</span></div>
          {filtered.length > 0 ? (
            <div className={cn("mt-3", view === "list" ? "space-y-2" : "grid gap-3 sm:grid-cols-2 xl:grid-cols-3")}>
              {filtered.map((api) => view === "list" ? <ApiListRow key={api.id} api={api} /> : <ApiCard key={api.id} api={api} />)}
            </div>
          ) : (
            <div className="mt-3 grid min-h-72 place-items-center rounded-[6px] border border-dashed border-[var(--line-strong)] bg-[var(--surface)] px-6 text-center">
              <div><Search className="mx-auto size-8 text-[var(--line-strong)]" /><h2 className="mt-4 text-[13px] font-bold">没有匹配的接口</h2><p className="mt-1 text-[10px] text-[var(--muted)]">调整关键词、分类、请求方法或计费方式。</p><button type="button" onClick={clearFilters} className="mt-4 text-[10px] font-semibold text-[var(--brand)]">清除全部筛选</button></div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
