"use client";

import Link from "next/link";
import { ArrowRight, ArrowUpRight, BadgeCheck, Boxes, Gauge, LayoutGrid, List, Search, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import type { CatalogProduct } from "@/lib/catalog";
import { cn, getMethodClass } from "@/lib/utils";
import { ApiCard } from "@/components/api-card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { EmptyState } from "./ui/empty-state";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

type Mode = "preview" | "full";

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
    return <section className="container-shell py-12 sm:py-16"><div className="page-heading"><div><p className="eyebrow">FEATURED API</p><h2 className="mt-2 text-2xl font-bold">开放能力精选</h2><p className="page-description mt-2">来自管理员已发布并可真实调用的接口。</p></div><Button asChild variant="secondary" size="sm"><Link href="/marketplace">进入 API 市场<ArrowRight /></Link></Button></div>{featured.length ? <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{featured.map((api) => <ApiCard key={api.id} api={api} />)}</div> : <EmptyState icon={Boxes} title="暂无可用 API" description="管理员发布真实接口后将在这里显示。" className="mt-6 rounded-[8px] border border-dashed border-[var(--line-strong)]" />}</section>;
  }

  return <div className="market-page">
    <section className="market-search-band"><div className="container-shell"><div className="market-title"><div><p className="eyebrow">API MARKETPLACE</p><h1>API 市场</h1><p>发现、比较并订阅真实开放能力</p></div><span><strong>{products.length}</strong> 个已发布接口</span></div><label className="market-search"><Search /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索 API 名称、服务商、访问路径或标签" aria-label="搜索 API" /></label></div></section>

    <div className="container-shell py-6">
      <nav className="market-categories" aria-label="API 分类">{categories.map((item) => <button key={item} type="button" onClick={() => setCategory(item)} className={cn(category === item && "is-active")}><Boxes /><span>{item}</span><small>{item === "全部" ? products.length : products.filter((api) => api.category === item).length}</small></button>)}</nav>
      <div className="market-toolbar"><div><strong>{filtered.length}</strong><span> 个匹配结果</span></div><div className="market-filters"><FilterSelect value={method} onValueChange={setMethod} options={["全部", "GET", "POST", "PUT", "PATCH", "DELETE"]} label="请求方法" /><FilterSelect value={billing} onValueChange={setBilling} options={["全部", "免费", "付费"]} label="计费方式" /><FilterSelect value={sort} onValueChange={setSort} options={["推荐", "调用最多", "响应最快"]} label="排序方式" /><div className="market-view-toggle"><Button type="button" onClick={() => setView("list")} variant={view === "list" ? "soft" : "ghost"} size="icon-sm" aria-label="列表视图"><List /></Button><Button type="button" onClick={() => setView("grid")} variant={view === "grid" ? "soft" : "ghost"} size="icon-sm" aria-label="网格视图"><LayoutGrid /></Button></div></div></div>
      <main className={view === "grid" ? "market-results-grid" : "market-results-list"}>{filtered.map((api) => view === "grid" ? <ApiCard key={api.id} api={api} /> : <ApiRow key={api.id} api={api} />)}</main>
      {!filtered.length && <EmptyState icon={Boxes} title="没有匹配的 API" description="调整关键词或筛选条件后重试。" className="mt-3 rounded-[8px] border border-dashed border-[var(--line-strong)]" />}
    </div>
  </div>;
}

function ApiRow({ api }: { api: CatalogProduct }) {
  return <Link href={`/apis/${api.slug}`} className="market-api-row"><span className="market-api-logo" style={{ background: api.color }}>{api.shortName}</span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3>{api.name}</h3>{api.verified && <BadgeCheck className="size-3.5 fill-[var(--brand)] text-white" />}<span className={cn("mono market-method", getMethodClass(api.method))}>{api.method}</span><Badge>{api.category}</Badge></div><p>{api.description}</p><small>由 <strong>{api.provider}</strong> 提供</small></div><div className="market-api-stats"><Metric label="平均响应" value={api.latency == null ? "暂无" : `${api.latency} ms`} icon={Gauge} /><Metric label="真实可用率" value={api.uptime == null ? "暂无" : `${api.uptime}%`} icon={ShieldCheck} /><span><small>价格</small><strong>{api.price}</strong></span><ArrowUpRight /></div></Link>;
}

function Metric({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Gauge }) { return <span><small>{label}</small><strong><Icon />{value}</strong></span>; }
function FilterSelect({ value, onValueChange, options, label }: { value: string; onValueChange: (value: string) => void; options: string[]; label: string }) { return <Select value={value} onValueChange={onValueChange}><SelectTrigger size="sm" className="w-28" aria-label={label}><SelectValue /></SelectTrigger><SelectContent>{options.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select>; }
