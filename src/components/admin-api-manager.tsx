"use client";

import {
  CheckCircle2,
  ChevronDown,
  Download,
  MoreHorizontal,
  Plus,
  Search,
  X,
} from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { apiProducts, categories } from "@/lib/data";
import type { ApiCategory, ApiProduct } from "@/lib/types";

type ManagedApi = ApiProduct & {
  version: string;
  status: "已上架" | "草稿";
  access: "免费" | "按量计费" | "套餐内";
};

type ApiForm = {
  name: string;
  endpoint: string;
  method: ApiProduct["method"];
  category: Exclude<ApiCategory, "全部">;
  provider: string;
  access: ManagedApi["access"];
  price: string;
};

const initialApis: ManagedApi[] = apiProducts.map((api, index) => ({
  ...api,
  version: `v1.${8 - (index % 3)}.0`,
  status: "已上架",
  access: api.price.startsWith("免费") ? "免费" : "按量计费",
}));

const emptyForm: ApiForm = {
  name: "",
  endpoint: "/v1/",
  method: "POST",
  category: "企业数据",
  provider: "",
  access: "按量计费",
  price: "¥0.03 / 次",
};

export function AdminApiManager() {
  const [apis, setApis] = useState(initialApis);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"全部" | ManagedApi["status"]>("全部");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<ApiForm>(emptyForm);
  const [notice, setNotice] = useState("");

  const filteredApis = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return apis.filter((api) => {
      const matchesQuery = !keyword || [api.name, api.endpoint, api.provider].some((value) => value.toLowerCase().includes(keyword));
      return matchesQuery && (status === "全部" || api.status === status);
    });
  }, [apis, query, status]);

  function updateForm<Key extends keyof ApiForm>(key: Key, value: ApiForm[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function closeDialog() {
    setDialogOpen(false);
    setForm(emptyForm);
  }

  function createApi(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const endpoint = form.endpoint.startsWith("/") ? form.endpoint : `/${form.endpoint}`;
    const newApi: ManagedApi = {
      id: `api_${Date.now()}`,
      slug: form.name.toLowerCase().replace(/\s+/g, "-"),
      name: form.name.trim(),
      shortName: form.name.trim().slice(0, 2).toUpperCase(),
      category: form.category,
      description: "待补充接口能力说明与请求示例。",
      method: form.method,
      endpoint,
      latency: 0,
      uptime: 100,
      calls: "0",
      price: form.access === "免费" ? "免费" : form.access === "套餐内" ? "套餐内" : form.price.trim(),
      tags: [form.access],
      provider: form.provider.trim(),
      color: "#08785d",
      version: "v1.0.0",
      status: "草稿",
      access: form.access,
    };
    setApis((current) => [newApi, ...current]);
    setNotice(`${newApi.name} 已创建为草稿`);
    closeDialog();
  }

  function exportApis() {
    const rows = filteredApis.map((api) => [api.name, api.provider, api.method, api.endpoint, api.version, api.access, api.status]);
    const csv = ["API,服务商,方法,路径,版本,计费方式,状态", ...rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "star-api-list.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return <div className="mx-auto max-w-[1440px] space-y-5">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div><p className="eyebrow">API GOVERNANCE</p><h2 className="mt-1 text-xl font-bold">API 生命周期管理</h2><p className="mt-1 text-[11px] text-[var(--muted)]">管理服务准入、版本、定价、SLA 与上下架流程。</p></div>
      <button onClick={() => setDialogOpen(true)} className="inline-flex h-9 items-center justify-center gap-2 rounded-[4px] bg-[var(--brand)] px-4 text-[10px] font-semibold text-white"><Plus className="size-3.5" /> 新建 API</button>
    </div>

    {notice && <div role="status" className="flex items-center justify-between rounded-[4px] border border-[#c8e2d8] bg-[var(--brand-soft)] px-3 py-2.5 text-[10px] text-[var(--brand-strong)]"><span className="inline-flex items-center gap-2"><CheckCircle2 className="size-3.5" />{notice}</span><button onClick={() => setNotice("")} aria-label="关闭提示"><X className="size-3.5" /></button></div>}

    <section className="panel overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-[var(--line)] p-4 lg:flex-row">
        <label className="flex h-9 flex-1 items-center gap-2 border border-[var(--line)] px-3 lg:max-w-sm"><Search className="size-3.5 text-[var(--muted)]" /><span className="sr-only">搜索 API</span><input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 text-[10px] outline-none" placeholder="名称、路径或服务商" /></label>
        <label className="relative"><span className="sr-only">筛选状态</span><select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className="h-9 min-w-32 appearance-none border border-[var(--line)] bg-white pl-3 pr-8 text-[10px]"><option>全部</option><option>已上架</option><option>草稿</option></select><ChevronDown className="pointer-events-none absolute right-2.5 top-3 size-3 text-[var(--muted)]" /></label>
        <button onClick={exportApis} className="inline-flex h-9 items-center justify-center gap-2 border border-[var(--line)] px-3 text-[10px]"><Download className="size-3" /> 导出</button>
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-[10px]"><thead className="bg-[var(--surface-subtle)] text-[var(--muted)]"><tr><th className="px-4 py-3 font-medium">API</th><th className="px-4 py-3 font-medium">服务商</th><th className="px-4 py-3 font-medium">版本 / 路径</th><th className="px-4 py-3 font-medium">计费</th><th className="px-4 py-3 font-medium">SLA</th><th className="px-4 py-3 font-medium">状态</th><th className="px-4 py-3"><span className="sr-only">操作</span></th></tr></thead>
        <tbody className="divide-y divide-[var(--line)]">{filteredApis.map((api) => <tr key={api.id} className="hover:bg-[var(--surface-subtle)]"><td className="px-4 py-3"><div className="flex items-center gap-2.5"><span className="grid size-7 shrink-0 place-items-center rounded-[4px] text-[9px] font-bold text-white" style={{ background: api.color }}>{api.shortName}</span><span><strong className="block">{api.name}</strong><small className={`mt-0.5 block font-semibold ${api.method === "GET" ? "text-[#28609a]" : "text-[var(--brand)]"}`}>{api.method} · {api.category}</small></span></div></td><td className="px-4 py-3 text-[var(--muted)]">{api.provider}</td><td className="px-4 py-3"><span className="block">{api.version}</span><code className="mono mt-0.5 block text-[8px] text-[var(--muted)]">{api.endpoint}</code></td><td className="px-4 py-3"><span className="block">{api.access}</span><small className="text-[8px] text-[var(--muted)]">{api.price}</small></td><td className="px-4 py-3">{api.uptime}%</td><td className="px-4 py-3"><span className={`inline-flex items-center gap-1 rounded-[3px] px-2 py-1 text-[9px] ${api.status === "已上架" ? "bg-[var(--brand-soft)] text-[var(--brand-strong)]" : "bg-[var(--warning-soft)] text-[#784707]"}`}><span className={`size-1.5 rounded-full ${api.status === "已上架" ? "bg-[var(--brand)]" : "bg-[var(--warning)]"}`} />{api.status}</span></td><td className="px-4 py-3"><button aria-label={`${api.name}更多操作`} className="grid size-7 place-items-center"><MoreHorizontal className="size-4 text-[var(--muted)]" /></button></td></tr>)}</tbody>
      </table></div>
      <div className="flex items-center justify-between border-t border-[var(--line)] px-4 py-3 text-[9px] text-[var(--muted)]"><span>显示 {filteredApis.length} / {apis.length} 个 API</span><span>草稿需完成文档与网关校验后发布</span></div>
    </section>

    {dialogOpen && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/35 p-4" role="presentation" onMouseDown={closeDialog}><form onSubmit={createApi} role="dialog" aria-modal="true" aria-labelledby="new-api-title" className="my-auto w-full max-w-2xl rounded-[6px] bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}><div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4"><div><h3 id="new-api-title" className="text-[13px] font-bold">新建 API</h3><p className="mt-1 text-[9px] text-[var(--muted)]">先创建草稿，再补充版本文档、鉴权与网关策略。</p></div><button type="button" onClick={closeDialog} aria-label="关闭"><X className="size-4 text-[var(--muted)]" /></button></div>
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label="API 名称"><input required autoFocus value={form.name} onChange={(event) => updateForm("name", event.target.value)} placeholder="例如：企业工商信息查询" className="h-10 w-full border border-[var(--line)] px-3 text-[11px] outline-none focus:border-[var(--brand)]" /></Field>
        <Field label="服务商"><input required value={form.provider} onChange={(event) => updateForm("provider", event.target.value)} placeholder="选择或输入服务商" className="h-10 w-full border border-[var(--line)] px-3 text-[11px] outline-none focus:border-[var(--brand)]" /></Field>
        <Field label="请求方法"><select value={form.method} onChange={(event) => updateForm("method", event.target.value as ApiProduct["method"])} className="h-10 w-full border border-[var(--line)] bg-white px-3 text-[11px]"><option>GET</option><option>POST</option></select></Field>
        <Field label="能力分类"><select value={form.category} onChange={(event) => updateForm("category", event.target.value as ApiForm["category"])} className="h-10 w-full border border-[var(--line)] bg-white px-3 text-[11px]">{categories.filter((category) => category !== "全部").map((category) => <option key={category}>{category}</option>)}</select></Field>
        <div className="sm:col-span-2"><Field label="网关路径"><input required value={form.endpoint} onChange={(event) => updateForm("endpoint", event.target.value)} placeholder="/v1/service/action" className="mono h-10 w-full border border-[var(--line)] px-3 text-[11px] outline-none focus:border-[var(--brand)]" /></Field></div>
        <Field label="计费方式"><select value={form.access} onChange={(event) => updateForm("access", event.target.value as ManagedApi["access"])} className="h-10 w-full border border-[var(--line)] bg-white px-3 text-[11px]"><option>免费</option><option>按量计费</option><option>套餐内</option></select></Field>
        <Field label="调用单价">{form.access === "按量计费" ? <input required value={form.price} onChange={(event) => updateForm("price", event.target.value)} placeholder="¥0.03 / 次" className="h-10 w-full border border-[var(--line)] px-3 text-[11px] outline-none focus:border-[var(--brand)]" /> : <div className="flex h-10 items-center border border-[var(--line)] bg-[var(--surface-subtle)] px-3 text-[10px] text-[var(--muted)]">{form.access === "免费" ? "用户可在免费额度内调用" : "按用户订阅套餐核减配额"}</div>}</Field>
      </div>
      <div className="flex justify-end gap-2 border-t border-[var(--line)] px-5 py-4"><button type="button" onClick={closeDialog} className="h-9 rounded-[4px] border border-[var(--line)] px-4 text-[10px] font-semibold">取消</button><button type="submit" className="h-9 rounded-[4px] bg-[var(--brand)] px-4 text-[10px] font-semibold text-white">创建草稿</button></div>
    </form></div>}
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-[10px] font-semibold">{label}</span>{children}</label>;
}
