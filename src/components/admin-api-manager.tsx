"use client";

import { CheckCircle2, ChevronDown, Download, Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { apiCategories, type CatalogProduct } from "@/lib/catalog";
import { internalHandlerTemplates } from "@/lib/internal-handlers";

const statusNames = { DRAFT: "草稿", REVIEW: "审核中", PUBLISHED: "已发布", DEPRECATED: "已弃用", OFFLINE: "已下线" } as const;
const inputClass = "h-10 w-full rounded-[6px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[11px] outline-none focus:border-[var(--brand)]";

export function AdminApiManager({ initialApis }: { initialApis: CatalogProduct[] }) {
  const [apis, setApis] = useState(initialApis);
  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [executionMode, setExecutionMode] = useState<"INTERNAL" | "EXTERNAL">("EXTERNAL");
  const [authType, setAuthType] = useState("NONE");
  const [billingMode, setBillingMode] = useState<"FREE" | "PER_REQUEST">("FREE");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return apis.filter((api) => !keyword || [api.name, api.slug, api.provider, api.category].join(" ").toLowerCase().includes(keyword));
  }, [apis, query]);

  async function createApi(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const tags = String(form.get("tags") ?? "").split(",").map((item) => item.trim()).filter(Boolean);
    const payload = Object.fromEntries(form.entries());
    try {
      const response = await fetch("/api/v1/admin/apis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, tags, featured: form.get("featured") === "on", allowPrivateNetwork: form.get("allowPrivateNetwork") === "on", executionMode, billingMode, unitPrice: form.get("unitPrice") || 0 }) });
      const result = await response.json();
      if (!response.ok) { setError(result.message ?? "API 创建失败"); return; }
      setApis((current) => [result.data, ...current]);
      setNotice(`${result.data.name} 已创建为草稿`);
      setDialogOpen(false);
    } catch { setError("无法连接 API 管理服务"); }
    finally { setSaving(false); }
  }

  async function changeStatus(api: CatalogProduct, status: CatalogProduct["status"]) {
    const response = await fetch("/api/v1/admin/apis", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: api.id, status }) });
    const result = await response.json();
    if (!response.ok) { setError(result.message ?? "状态更新失败"); return; }
    setApis((current) => current.map((item) => item.id === api.id ? result.data : item));
    setNotice(`${api.name} 已更新为${statusNames[status]}`);
  }

  async function deleteApi(api: CatalogProduct) {
    if (!window.confirm(`确认删除“${api.name}”？该操作不可撤销。`)) return;
    const response = await fetch(`/api/v1/admin/apis?id=${encodeURIComponent(api.id)}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) { setError(result.message ?? "删除失败"); return; }
    setApis((current) => current.filter((item) => item.id !== api.id));
    setNotice(`${api.name} 已删除`);
  }

  function exportApis() {
    const rows = filtered.map((api) => [api.name, api.slug, api.provider, api.method, api.endpoint, api.executionMode, api.price, statusNames[api.status]]);
    const csv = ["API,标识,服务商,方法,路径,接入方式,计费,状态", ...rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "star-api-list.csv"; link.click(); URL.revokeObjectURL(url);
  }

  return <div className="mx-auto max-w-[1440px] space-y-5">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="eyebrow">API GOVERNANCE</p><h2 className="mt-1 text-xl font-bold">API 生命周期管理</h2><p className="mt-1 text-[11px] text-[var(--muted)]">配置真实上游或内置处理器，并统一执行鉴权、限流、计量与计费。</p></div><button onClick={() => { setDialogOpen(true); setError(""); }} className="inline-flex h-9 items-center justify-center gap-2 rounded-[6px] bg-[var(--brand)] px-4 text-[10px] font-semibold text-white"><Plus className="size-3.5" />新建 API</button></div>
    {notice && <div role="status" className="flex items-center justify-between rounded-[6px] border border-[#c8e2d8] bg-[var(--brand-soft)] px-3 py-2.5 text-[10px] text-[var(--brand-strong)]"><span className="inline-flex items-center gap-2"><CheckCircle2 className="size-3.5" />{notice}</span><button onClick={() => setNotice("")} aria-label="关闭提示"><X className="size-3.5" /></button></div>}
    {error && !dialogOpen && <p role="alert" className="rounded-[6px] bg-[var(--danger-soft)] px-3 py-2.5 text-[10px] text-[var(--danger)]">{error}</p>}
    <section className="panel overflow-hidden"><div className="flex flex-col gap-3 border-b border-[var(--line)] p-4 sm:flex-row"><label className="flex h-9 flex-1 items-center gap-2 rounded-[6px] border border-[var(--line)] px-3 sm:max-w-sm"><Search className="size-3.5 text-[var(--muted)]" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 text-[10px] outline-none" placeholder="名称、标识、服务商或分类" /></label><button onClick={exportApis} disabled={!filtered.length} className="inline-flex h-9 items-center justify-center gap-2 rounded-[6px] border border-[var(--line)] px-3 text-[10px] disabled:opacity-50"><Download className="size-3.5" />导出</button></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-[10px]"><thead className="bg-[var(--surface-subtle)] text-[var(--muted)]"><tr><th className="px-4 py-3">API</th><th className="px-4 py-3">端点</th><th className="px-4 py-3">执行</th><th className="px-4 py-3">计费</th><th className="px-4 py-3">真实调用</th><th className="px-4 py-3">状态</th><th className="px-4 py-3">操作</th></tr></thead><tbody className="divide-y divide-[var(--line)]">{filtered.map((api) => <tr key={api.id} className="hover:bg-[var(--surface-subtle)]"><td className="px-4 py-3"><div className="flex items-center gap-2.5"><span className="grid size-8 place-items-center rounded-[6px] text-[9px] font-bold text-white" style={{ background: api.color }}>{api.shortName}</span><span><strong className="block">{api.name}</strong><small className="text-[8px] text-[var(--muted)]">{api.provider} · {api.slug}</small></span></div></td><td className="px-4 py-3"><strong className="text-[var(--brand)]">{api.method}</strong><code className="mono ml-2 text-[9px]">{api.endpoint}</code></td><td className="px-4 py-3">{api.executionMode === "INTERNAL" ? "内置处理器" : "外部转发"}</td><td className="px-4 py-3">{api.price}</td><td className="px-4 py-3">{api.calls.toLocaleString("zh-CN")} 次</td><td className="px-4 py-3"><label className="relative inline-block"><select value={api.status} onChange={(event) => changeStatus(api, event.target.value as CatalogProduct["status"])} className="h-8 appearance-none rounded-[5px] border border-[var(--line)] bg-[var(--surface)] pl-2 pr-7 text-[9px]"><option value="DRAFT">草稿</option><option value="REVIEW">审核中</option><option value="PUBLISHED">已发布</option><option value="DEPRECATED">已弃用</option><option value="OFFLINE">已下线</option></select><ChevronDown className="pointer-events-none absolute right-2 top-2.5 size-3" /></label></td><td className="px-4 py-3"><button onClick={() => deleteApi(api)} className="grid size-8 place-items-center rounded-[5px] text-[var(--muted)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]" title="删除 API" aria-label={`删除 ${api.name}`}><Trash2 className="size-3.5" /></button></td></tr>)}</tbody></table></div>
      {!filtered.length && <div className="px-5 py-14 text-center"><p className="text-[12px] font-semibold">暂无 API</p><p className="mt-1 text-[10px] text-[var(--muted)]">创建并发布真实接口后，才会出现在 API 市场。</p></div>}
      <div className="border-t border-[var(--line)] px-4 py-3 text-[9px] text-[var(--muted)]">共 {filtered.length} 条真实记录</div>
    </section>
    {dialogOpen && <div className="fixed inset-0 z-50 overflow-y-auto bg-black/45 p-4" onMouseDown={() => setDialogOpen(false)}><form onSubmit={createApi} onMouseDown={(event) => event.stopPropagation()} className="mx-auto my-6 w-full max-w-4xl rounded-[8px] bg-[var(--surface)] shadow-2xl"><div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4"><div><h3 className="text-[14px] font-bold">新建 API</h3><p className="mt-1 text-[9px] text-[var(--muted)]">保存后生成草稿，不会自动发布。</p></div><button type="button" onClick={() => setDialogOpen(false)} aria-label="关闭"><X className="size-4" /></button></div>
      <div className="space-y-6 p-5"><Section title="基本信息"><div className="grid gap-4 sm:grid-cols-2"><Field label="API 名称"><input name="name" required minLength={2} className={inputClass} /></Field><Field label="唯一标识"><input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="company-verify" className={inputClass} /></Field><Field label="图标短名"><input name="shortName" required maxLength={4} placeholder="CV" className={inputClass} /></Field><Field label="能力分类"><select name="category" className={inputClass}>{apiCategories.map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="服务商品牌"><input name="providerName" required className={inputClass} /></Field><Field label="服务商法定名称"><input name="providerLegalName" required className={inputClass} /></Field><Field label="服务商联系邮箱"><input name="providerEmail" required type="email" className={inputClass} /></Field><Field label="标识颜色"><input name="color" required type="color" defaultValue="#08785d" className={inputClass} /></Field><div className="sm:col-span-2"><Field label="接口说明"><textarea name="description" required minLength={10} rows={3} className="w-full rounded-[6px] border border-[var(--line)] bg-[var(--surface)] p-3 text-[11px] outline-none" /></Field></div><Field label="标签（英文逗号分隔）"><input name="tags" className={inputClass} /></Field><label className="flex items-end gap-2 pb-2 text-[10px]"><input name="featured" type="checkbox" />首页推荐</label></div></Section>
      <Section title="端点与执行"><div className="mb-4 grid grid-cols-2 gap-2 rounded-[7px] bg-[var(--surface-subtle)] p-1"><button type="button" onClick={() => setExecutionMode("EXTERNAL")} className={`h-9 rounded-[6px] text-[10px] font-semibold ${executionMode === "EXTERNAL" ? "bg-[var(--surface)] shadow-sm" : "text-[var(--muted)]"}`}>外部接口转发</button><button type="button" onClick={() => setExecutionMode("INTERNAL")} className={`h-9 rounded-[6px] text-[10px] font-semibold ${executionMode === "INTERNAL" ? "bg-[var(--surface)] shadow-sm" : "text-[var(--muted)]"}`}>内置处理器</button></div><div className="grid gap-4 sm:grid-cols-3"><Field label="版本"><input name="version" required defaultValue="v1" className={inputClass} /></Field><Field label="请求方法"><select name="method" className={inputClass}><option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option></select></Field><Field label="网关子路径"><input name="path" required defaultValue="/" className={inputClass} /></Field><div className="sm:col-span-3"><Field label="端点摘要"><input name="summary" required className={inputClass} /></Field></div>{executionMode === "INTERNAL" ? <div className="sm:col-span-3"><Field label="内置方案"><select name="internalHandler" className={inputClass}>{internalHandlerTemplates.map((item) => <option key={item.id} value={item.id}>{item.name} - {item.description}</option>)}</select></Field></div> : <><div className="sm:col-span-2"><Field label="上游基础地址"><input name="upstreamBaseUrl" required type="url" placeholder="https://provider.example.com/api/" className={inputClass} /></Field></div><Field label="鉴权方式"><select name="upstreamAuthType" value={authType} onChange={(event) => setAuthType(event.target.value)} className={inputClass}><option value="NONE">无</option><option value="BEARER">Bearer Token</option><option value="HEADER">自定义请求头</option></select></Field>{authType === "BEARER" && <div className="sm:col-span-3"><Field label="Bearer Token（加密保存）"><input name="upstreamToken" required type="password" autoComplete="off" className={inputClass} /></Field></div>}{authType === "HEADER" && <><Field label="请求头名称"><input name="upstreamHeaderName" required className={inputClass} /></Field><div className="sm:col-span-2"><Field label="请求头值（加密保存）"><input name="upstreamHeaderValue" required type="password" autoComplete="off" className={inputClass} /></Field></div></>}<label className="sm:col-span-3 flex items-center gap-2 text-[10px]"><input name="allowPrivateNetwork" type="checkbox" />允许访问内网地址（仅用于受控企业网络）</label></>}</div></Section>
      <Section title="计量与服务等级"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Field label="计费方式"><select value={billingMode} onChange={(event) => setBillingMode(event.target.value as typeof billingMode)} className={inputClass}><option value="FREE">免费</option><option value="PER_REQUEST">按成功请求计费</option></select></Field><Field label="单价（元/次）"><input name="unitPrice" type="number" min="0" step="0.000001" disabled={billingMode === "FREE"} className={inputClass} /></Field><Field label="每月免费次数"><input name="freeQuotaMonthly" required type="number" min="0" defaultValue="0" className={inputClass} /></Field><Field label="默认 QPS"><input name="defaultQpsLimit" required type="number" min="1" defaultValue="10" className={inputClass} /></Field><Field label="超时（毫秒）"><input name="timeoutMs" required type="number" min="500" max="60000" defaultValue="10000" className={inputClass} /></Field><Field label="承诺 SLA（%）"><input name="sla" required type="number" min="0" max="100" step="0.001" defaultValue="99.9" className={inputClass} /></Field></div></Section>{error && <p role="alert" className="rounded-[6px] bg-[var(--danger-soft)] px-3 py-2 text-[10px] text-[var(--danger)]">{error}</p>}</div><div className="flex justify-end gap-2 border-t border-[var(--line)] px-5 py-4"><button type="button" onClick={() => setDialogOpen(false)} className="h-9 rounded-[6px] border border-[var(--line)] px-4 text-[10px]">取消</button><button disabled={saving} className="inline-flex h-9 items-center gap-2 rounded-[6px] bg-[var(--brand)] px-4 text-[10px] font-semibold text-white disabled:opacity-60">{saving && <Loader2 className="size-3.5 animate-spin" />}{saving ? "正在创建" : "创建草稿"}</button></div></form></div>}
  </div>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) { return <section><h4 className="mb-3 border-b border-[var(--line)] pb-2 text-[11px] font-bold">{title}</h4>{children}</section>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-[10px] font-semibold">{label}</span>{children}</label>; }
