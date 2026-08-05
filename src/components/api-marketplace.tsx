"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import { useMemo, useState } from "react";
import { apiProducts, categories } from "@/lib/data";
import type { ApiCategory } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ApiCard } from "./api-card";

export function ApiMarketplace() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ApiCategory>("全部");
  const [sort, setSort] = useState("推荐排序");

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const result = apiProducts.filter((api) => {
      const inCategory = category === "全部" || api.category === category;
      const inQuery = !normalized || [api.name, api.description, api.provider, ...api.tags].join(" ").toLowerCase().includes(normalized);
      return inCategory && inQuery;
    });
    return [...result].sort((a, b) => {
      if (sort === "响应最快") return a.latency - b.latency;
      if (sort === "调用最多") return Number.parseFloat(b.calls) - Number.parseFloat(a.calls);
      return Number(Boolean(b.featured)) - Number(Boolean(a.featured));
    });
  }, [category, query, sort]);

  return (
    <section className="container-shell py-8 sm:py-10" aria-labelledby="market-heading">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <p className="eyebrow">API CATALOG / {apiProducts.length} SERVICES</p>
          <h2 id="market-heading" className="mt-2 text-2xl font-bold">可直接接入的企业能力</h2>
          <p className="mt-2 text-[13px] text-[var(--muted)]">统一鉴权、统一账单、统一服务等级，减少供应商接入和维护成本。</p>
        </div>
        <label className="flex h-11 w-full items-center gap-2 border border-[var(--line-strong)] bg-white px-3 shadow-sm focus-within:border-[var(--brand)] lg:w-[390px]">
          <Search className="size-4 text-[var(--muted)]" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-[13px] outline-none" placeholder="搜索接口、能力或供应商" aria-label="搜索 API" />
          {query && <button onClick={() => setQuery("")} className="grid size-7 place-items-center text-[var(--muted)]" aria-label="清空搜索"><X className="size-3.5" /></button>}
          <kbd className="hidden rounded-[3px] border border-[var(--line)] bg-[var(--surface-subtle)] px-1.5 py-0.5 text-[10px] text-[var(--muted)] sm:block">⌘ K</kbd>
        </label>
      </div>

      <div className="mt-7 flex flex-col gap-3 border-y border-[var(--line)] py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 overflow-x-auto pb-1 sm:pb-0" role="tablist" aria-label="API 分类">
          {categories.map((item) => (
            <button key={item} onClick={() => setCategory(item)} className={cn("shrink-0 rounded-[4px] px-3 py-2 text-[12px] font-medium text-[var(--muted)] hover:bg-white hover:text-[var(--ink)]", category === item && "bg-[var(--night)] text-white hover:bg-[var(--night)] hover:text-white")} role="tab" aria-selected={category === item}>
              {item}
            </button>
          ))}
        </div>
        <label className="flex shrink-0 items-center gap-2 text-[12px] text-[var(--muted)]">
          <SlidersHorizontal className="size-3.5" />
          <select value={sort} onChange={(event) => setSort(event.target.value)} className="bg-transparent font-medium text-[var(--ink)] outline-none">
            <option>推荐排序</option><option>响应最快</option><option>调用最多</option>
          </select>
        </label>
      </div>

      {filtered.length > 0 ? (
        <div className="mt-6 grid grid-cols-1 overflow-hidden border-l border-t border-[var(--line)] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((api) => <ApiCard key={api.id} api={api} />)}
        </div>
      ) : (
        <div className="panel mt-6 grid min-h-64 place-items-center px-6 text-center">
          <div><Search className="mx-auto size-8 text-[var(--line-strong)]" /><h3 className="mt-4 font-bold">没有匹配的接口</h3><p className="mt-1 text-[12px] text-[var(--muted)]">换一个关键词，或清除当前分类条件。</p><button onClick={() => { setQuery(""); setCategory("全部"); }} className="mt-4 text-[12px] font-semibold text-[var(--brand)]">清除筛选</button></div>
        </div>
      )}
    </section>
  );
}
