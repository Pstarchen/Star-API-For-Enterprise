"use client";

import { Boxes, Braces, CheckCircle2, ChevronDown, CircleAlert, Download, FileCode2, FileImage, Globe2, ImagePlus, Library, Link2, Loader2, Plus, Search, Settings2, ShieldCheck, Trash2, Type, Upload, WandSparkles, X } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { apiSlugFromName, buildPublicApiUrl, normalizePublicPath } from "@/lib/api-routes";
import { apiCategories, type CatalogProduct } from "@/lib/catalog";
import { internalHandlerTemplates, isAssetBackedHandler, phpHandlerId } from "@/lib/internal-handlers";
import { ApiConfigManager } from "@/components/api-config-manager";
import { OpenApiImportDialog } from "@/components/openapi-import-dialog";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import { EmptyState } from "./ui/empty-state";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow } from "./ui/table";

type SourceType = "RANDOM_IMAGE" | "RANDOM_TEXT" | "STATIC_JSON" | "PHP_PACKAGE" | "EXTERNAL" | "SERVER_LOCAL" | "TUNNEL" | "BUILTIN";
type AssetView = { id: string; kind: string; name: string; mimeType: string; size: number; createdAt: string; preview: string | null };

const statusNames = { DRAFT: "草稿", REVIEW: "审核中", GRAY: "灰度中", PUBLISHED: "已发布", DEPRECATED: "已弃用", OFFLINE: "已下线" } as const;
const inputClass = "h-10 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[11px] outline-none focus:border-[var(--brand)]";
const textareaClass = "w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] p-3 text-[11px] leading-5 outline-none focus:border-[var(--brand)]";
const sourceOptions = [
  { id: "RANDOM_IMAGE", name: "随机图片", description: "上传多张图片，每次调用随机返回一张", icon: FileImage, tone: "bg-[var(--accent-soft)] text-[var(--accent)]" },
  { id: "RANDOM_TEXT", name: "随机文本", description: "录入多行文本或上传 TXT，每次返回一条", icon: Type, tone: "bg-[var(--aqua-soft)] text-[var(--aqua)]" },
  { id: "STATIC_JSON", name: "固定 JSON", description: "配置一个 JSON 响应，适合公告和静态数据", icon: Braces, tone: "bg-[var(--brand-soft)] text-[var(--brand)]" },
  { id: "PHP_PACKAGE", name: "PHP 程序包", description: "上传 PHP 与附属文件 ZIP，在隔离容器运行", icon: FileCode2, tone: "bg-[var(--brand-soft)] text-[var(--brand)]" },
  { id: "EXTERNAL", name: "外部 API", description: "代理已有接口并统一鉴权、限流和计费", icon: Globe2, tone: "bg-[var(--warning-soft)] text-[var(--warning)]" },
  { id: "SERVER_LOCAL", name: "服务器内网", description: "转发到 Docker 网络内已登记的本地服务", icon: Library, tone: "bg-[var(--aqua-soft)] text-[var(--aqua)]" },
  { id: "TUNNEL", name: "临时穿透", description: "接入 frp、ngrok 等临时调试地址", icon: Upload, tone: "bg-[var(--warning-soft)] text-[var(--warning)]" },
  { id: "BUILTIN", name: "内置工具", description: "时间、UUID、摘要和文本转换等工具", icon: WandSparkles, tone: "bg-[var(--surface-subtle)] text-[var(--ink)]" },
] as const;

export function AdminApiManager({ initialApis, defaultPublicHost, defaultPublicUrl, canPublish = true }: { initialApis: CatalogProduct[]; defaultPublicHost: string; defaultPublicUrl: string; canPublish?: boolean }) {
  const [apis, setApis] = useState(initialApis);
  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sourceType, setSourceType] = useState<SourceType>("RANDOM_IMAGE");
  const [authType, setAuthType] = useState("NONE");
  const [billingMode, setBillingMode] = useState<"FREE" | "PER_REQUEST">("FREE");
  const [builtinHandler, setBuiltinHandler] = useState<string>(internalHandlerTemplates[0].id);
  const [method, setMethod] = useState("GET");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [contentApi, setContentApi] = useState<CatalogProduct | null>(null);
  const [configApi, setConfigApi] = useState<CatalogProduct | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return apis.filter((api) => !keyword || [api.name, api.slug, api.provider, api.category].join(" ").toLowerCase().includes(keyword));
  }, [apis, query]);

  function selectSource(next: SourceType) {
    setSourceType(next);
    if (["RANDOM_IMAGE", "RANDOM_TEXT", "STATIC_JSON"].includes(next)) setMethod("GET");
    if (next === "PHP_PACKAGE") setMethod("ALL");
    if (next === "BUILTIN") setMethod(internalHandlerTemplates.find((item) => item.id === builtinHandler)?.methods[0] ?? "GET");
  }

  async function createApi(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? "").trim();
    const quickMode = value("creationMode") === "quick";
    const config = {
      sourceType,
      name: value("name"),
      slug: value("slug"),
      description: value("description"),
      category: value("category") || "其他",
      tags: value("tags").split(",").map((item) => item.trim()).filter(Boolean),
      featured: form.get("featured") === "on",
      providerName: value("providerName"),
      providerLegalName: value("providerLegalName"),
      providerEmail: value("providerEmail"),
      version: value("version") || "v1",
      publicHost: value("publicHost"),
      publicPath: value("publicPath") || `/api/${value("slug")}`,
      visibility: value("visibility") || "PUBLIC",
      method,
      path: value("upstreamPath") || `/${value("slug")}`,
      requestFormat: value("requestFormat") || "JSON",
      summary: "",
      internalHandler: sourceType === "BUILTIN" ? builtinHandler : undefined,
      upstreamBaseUrl: value("upstreamBaseUrl"),
      upstreamAuthType: ["EXTERNAL", "SERVER_LOCAL", "TUNNEL"].includes(sourceType) ? authType : "NONE",
      upstreamToken: value("upstreamToken"),
      upstreamHeaderName: value("upstreamHeaderName"),
      upstreamHeaderValue: value("upstreamHeaderValue"),
      allowPrivateNetwork: sourceType === "SERVER_LOCAL",
      rewriteMode: value("rewriteMode") || "PASSTHROUGH",
      upstreamPrefix: value("upstreamPrefix"),
      healthPath: value("healthPath") || (sourceType === "SERVER_LOCAL" ? "/health" : "/"),
      timeoutMs: value("timeoutMs") || 10000,
      corsEnabled: quickMode ? undefined : form.get("corsEnabled") === "on",
      forceHttps: quickMode ? undefined : form.get("forceHttps") === "on",
      requestLogging: quickMode ? undefined : form.get("requestLogging") === "on",
      dailyLimit: value("dailyLimit") || 0,
      ipAllowlist: value("ipAllowlist").split(",").map((item) => item.trim()).filter(Boolean),
      ipDenylist: value("ipDenylist").split(",").map((item) => item.trim()).filter(Boolean),
      billingMode,
      unitPrice: billingMode === "FREE" ? 0 : value("unitPrice"),
      freeQuotaMonthly: value("freeQuotaMonthly") || 0,
      defaultQpsLimit: value("defaultQpsLimit") || 10,
      sla: value("sla") || 99.9,
      content: value("content"),
      entryFile: value("entryFile") || "index.php",
    };
    const payload = new FormData();
    payload.append("config", JSON.stringify(config));
    for (const item of form.getAll("assets")) if (item instanceof File && item.size) payload.append("assets", item);
    try {
      const response = await fetch("/api/v1/admin/apis", { method: "POST", body: payload });
      const result = await response.json();
      if (!response.ok) {
        const fieldErrors = result.details?.fieldErrors ? Object.values(result.details.fieldErrors).flat().filter(Boolean).join("；") : "";
        setError(fieldErrors || result.message || "API 创建失败"); return;
      }
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
    if (!window.confirm(`确认删除“${api.name}”？已下线 API 的应用订阅将同时取消，该操作不可撤销。`)) return;
    const response = await fetch(`/api/v1/admin/apis?id=${encodeURIComponent(api.id)}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) { setError(result.message ?? "删除失败"); return; }
    setApis((current) => current.filter((item) => item.id !== api.id));
    setNotice(result.message || `${api.name} 已删除`);
  }

  function exportApis() {
    const rows = filtered.map((api) => [api.name, api.slug, api.provider, api.method, api.endpoint, executionLabel(api), api.price, statusNames[api.status]]);
    const csv = ["API,标识,服务商,方法,路径,来源,计费,状态", ...rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "star-api-list.csv"; link.click(); URL.revokeObjectURL(url);
  }

  return <div className="page-shell space-y-5">
    <div className="page-heading"><div><p className="eyebrow">API GOVERNANCE</p><h2 className="page-title mt-1">API 生命周期管理</h2><p className="page-description mt-1">上传内容、接入外部接口或选择内置工具，再统一配置免费或收费规则。</p></div><div className="flex gap-2"><Button onClick={() => { setImportOpen(true); setError(""); }} variant="secondary" size="sm"><Upload />导入 OpenAPI</Button><Button onClick={() => { setDialogOpen(true); setError(""); }} size="sm"><Plus />新建 API</Button></div></div>
    {notice && <div role="status" className="flex items-center justify-between rounded-[8px] border border-[color-mix(in_srgb,var(--success)_25%,var(--line))] bg-[color-mix(in_srgb,var(--success)_7%,var(--surface))] px-3 py-2.5 text-[10px] text-[var(--success)]"><span className="inline-flex items-center gap-2"><CheckCircle2 className="size-3.5" />{notice}</span><button onClick={() => setNotice("")} aria-label="关闭提示"><X className="size-3.5" /></button></div>}
    {error && !dialogOpen && <p role="alert" className="rounded-[8px] bg-[var(--danger-soft)] px-3 py-2.5 text-[10px] text-[var(--danger)]">{error}</p>}
    <section className="panel overflow-hidden"><div className="flex flex-col gap-3 border-b border-[var(--line)] p-4 sm:flex-row"><label className="relative flex-1 sm:max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 z-10 size-3.5 -translate-y-1/2 text-[var(--muted)]" /><Input value={query} onChange={(event) => setQuery(event.target.value)} className="h-9 pl-9 text-[10px]" placeholder="名称、标识、服务商或分类" /></label><Button onClick={exportApis} disabled={!filtered.length} variant="secondary" size="sm"><Download />导出</Button></div>
      <TableContainer><Table className="min-w-[1080px]"><TableHeader><TableRow className="hover:bg-transparent"><TableHead className="px-4">API</TableHead><TableHead className="px-4">公开端点</TableHead><TableHead className="px-4">来源</TableHead><TableHead className="px-4">计费</TableHead><TableHead className="px-4">真实调用</TableHead><TableHead className="px-4">状态</TableHead><TableHead className="px-4 text-right">操作</TableHead></TableRow></TableHeader><TableBody>{filtered.map((api) => <TableRow key={api.id}>
            <TableCell className="px-4"><strong className="block">{api.name}</strong><small className="text-[8px] text-[var(--muted)]">{api.provider} · {api.slug}</small></TableCell>
            <TableCell className="px-4"><strong className="text-[var(--brand)]">{api.method}</strong><code className="mono ml-2 text-[9px]">{buildPublicApiUrl({ platformUrl: defaultPublicUrl, publicHost: api.publicHost, publicPath: api.endpoint })}</code></TableCell>
            <TableCell className="px-4"><span className="block">{executionLabel(api)}</span>{isAssetBackedHandler(api.internalHandler) && <span className="mt-1 block text-[8px] text-[var(--muted)]">{api.assetCount} 个文件/内容项</span>}</TableCell>
            <TableCell className="px-4">{api.price}</TableCell><TableCell className="px-4"><strong className="block text-[11px]">{api.calls.toLocaleString("zh-CN")} 次</strong><span className="mt-1 block text-[8px] text-[var(--muted)]">今日 {api.todayCalls.toLocaleString("zh-CN")} · {api.uptime == null ? "暂无成功率" : `${api.uptime}% 成功`} · {api.latency == null ? "暂无延迟" : `${api.latency} ms`}</span></TableCell>
            <TableCell className="px-4"><Select value={api.status} onValueChange={(value) => changeStatus(api, value as CatalogProduct["status"])}><SelectTrigger size="sm" className="w-24"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="DRAFT">草稿</SelectItem><SelectItem value="REVIEW">审核中</SelectItem>{canPublish && <><SelectItem value="GRAY">灰度中</SelectItem><SelectItem value="PUBLISHED">已发布</SelectItem><SelectItem value="DEPRECATED">已弃用</SelectItem></>}<SelectItem value="OFFLINE">已下线</SelectItem></SelectContent></Select></TableCell>
            <TableCell className="px-4"><div className="flex justify-end gap-1"><Button onClick={() => setConfigApi(api)} variant="ghost" size="icon-sm" title="配置路由与上游" aria-label={`配置 ${api.name}`}><Settings2 /></Button>{isAssetBackedHandler(api.internalHandler) && <Button onClick={() => setContentApi(api)} variant="ghost" size="icon-sm" title="管理返回内容" aria-label={`管理 ${api.name} 的内容`}><Library /></Button>}<Button onClick={() => deleteApi(api)} variant="ghost" size="icon-sm" className="hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]" title="删除 API" aria-label={`删除 ${api.name}`}><Trash2 /></Button></div></TableCell>
          </TableRow>)}</TableBody></Table></TableContainer>
      {!filtered.length && <EmptyState icon={Boxes} title="暂无 API" description="可以从随机图片、文本、JSON 或外部接口开始创建。" />}
      <div className="border-t border-[var(--line)] px-4 py-3 text-[9px] text-[var(--muted)]">共 {filtered.length} 条真实记录</div>
    </section>
    {dialogOpen && <CreateDialog canPublish={canPublish} defaultPublicHost={defaultPublicHost} defaultPublicUrl={defaultPublicUrl} sourceType={sourceType} selectSource={selectSource} authType={authType} setAuthType={setAuthType} billingMode={billingMode} setBillingMode={setBillingMode} builtinHandler={builtinHandler} setBuiltinHandler={(id) => { setBuiltinHandler(id); setMethod(internalHandlerTemplates.find((item) => item.id === id)?.methods[0] ?? "GET"); }} method={method} setMethod={setMethod} advancedOpen={advancedOpen} setAdvancedOpen={setAdvancedOpen} saving={saving} error={error} close={() => setDialogOpen(false)} submit={createApi} />}
    {contentApi && <ContentManager api={contentApi} close={() => setContentApi(null)} changed={(count) => setApis((items) => items.map((item) => item.id === contentApi.id ? { ...item, assetCount: count } : item))} />}
    {configApi && <ApiConfigManager api={configApi} close={() => setConfigApi(null)} updated={(next) => { setApis((items) => items.some((item) => item.id === next.id) ? items.map((item) => item.id === next.id ? next : item) : [next, ...items]); setConfigApi(next); }} />}
    {importOpen && <OpenApiImportDialog defaultPublicHost={defaultPublicHost} close={() => setImportOpen(false)} imported={(next, message) => { setApis((items) => [next, ...items]); setNotice(message); setImportOpen(false); }} />}
  </div>;
}

type RouteCheckState = { status: "idle" | "checking" | "available" | "conflict" | "error"; message: string };

function CreateDialog(props: { canPublish: boolean; defaultPublicHost: string; defaultPublicUrl: string; sourceType: SourceType; selectSource: (value: SourceType) => void; authType: string; setAuthType: (value: string) => void; billingMode: "FREE" | "PER_REQUEST"; setBillingMode: (value: "FREE" | "PER_REQUEST") => void; builtinHandler: string; setBuiltinHandler: (value: string) => void; method: string; setMethod: (value: string) => void; advancedOpen: boolean; setAdvancedOpen: (value: boolean) => void; saving: boolean; error: string; close: () => void; submit: (event: FormEvent<HTMLFormElement>) => void }) {
  const [mode, setMode] = useState<"quick" | "full">("quick");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [publicHost, setPublicHost] = useState(props.defaultPublicHost);
  const [publicPath, setPublicPath] = useState("/api");
  const [version, setVersion] = useState("v1");
  const [slugEdited, setSlugEdited] = useState(false);
  const [pathEdited, setPathEdited] = useState(false);
  const [routeCheck, setRouteCheck] = useState<RouteCheckState>({ status: "idle", message: "填写名称后自动检查" });
  const selectedTemplate = internalHandlerTemplates.find((item) => item.id === props.builtinHandler) ?? internalHandlerTemplates[0];
  const routeInputValid = Boolean(publicHost && /^\/(?:[A-Za-z0-9._~!$&'()*+,;=:@%{}-]+\/?)*$/.test(publicPath) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && version);
  const displayedRouteCheck = routeInputValid ? routeCheck : { status: "idle", message: "填写完整后自动检查" } satisfies RouteCheckState;

  function changeName(nextName: string) {
    setName(nextName);
    if (slugEdited) return;
    const nextSlug = nextName.trim() ? apiSlugFromName(nextName) : "";
    setSlug(nextSlug);
    if (!pathEdited) setPublicPath(nextSlug ? `/api/${nextSlug}` : "/api");
  }

  function changeSlug(nextSlug: string) {
    const normalized = nextSlug.toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/-{2,}/g, "-").replace(/^-/, "");
    setSlugEdited(true);
    setSlug(normalized);
    if (!pathEdited) setPublicPath(normalized ? `/api/${normalized}` : "/api");
  }

  useEffect(() => {
    if (!routeInputValid) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setRouteCheck({ status: "checking", message: "正在检查路由" });
      const query = new URLSearchParams({ host: publicHost, path: publicPath, version, method: props.method, slug });
      try {
        const response = await fetch(`/api/v1/admin/apis/routes/check?${query}`, { signal: controller.signal });
        const result = await response.json();
        if (!response.ok) setRouteCheck({ status: "error", message: result.message ?? "路由检查失败" });
        else setRouteCheck({ status: result.data.available ? "available" : "conflict", message: result.message });
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setRouteCheck({ status: "error", message: "暂时无法检查，提交时仍会再次校验" });
      }
    }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [props.method, publicHost, publicPath, routeInputValid, slug, version]);

  const publicPathField = <Field label="公开路径"><input name="publicPath" required value={publicPath} onChange={(event) => { setPathEdited(true); setPublicPath(event.target.value); }} onBlur={() => setPublicPath(normalizePublicPath(publicPath))} className={inputClass} placeholder="/api/sjbz" /></Field>;
  const routeFields = <>
    <Field label="API 域名"><input name="publicHost" required value={publicHost} onChange={(event) => setPublicHost(event.target.value.toLowerCase())} className={inputClass} placeholder="api.example.com" /></Field>
    {publicPathField}
    <Field label="接口版本"><input name="version" value={version} onChange={(event) => setVersion(event.target.value)} className={inputClass} /></Field>
    <Field label="可见范围"><select name="visibility" defaultValue="PUBLIC" className={inputClass}><option value="PUBLIC">公开市场</option><option value="PRIVATE">指定企业</option><option value="GRAY">灰度测试</option><option value="INTERNAL">仅内部网关</option></select></Field>
  </>;

  return <Dialog open onOpenChange={(open) => { if (!open) props.close(); }}><DialogContent className="w-[min(calc(100%-24px),1024px)] p-0" showClose={false}><form onSubmit={props.submit}><input type="hidden" name="creationMode" value={mode} /><div className="flex flex-col gap-4 border-b border-[var(--line)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><DialogTitle className="text-[15px]">创建一个可调用的 API</DialogTitle><DialogDescription>快速添加使用安全默认值，完整配置保留全部网关能力。</DialogDescription></div><div className="flex items-center gap-2"><Tabs value={mode} onValueChange={(value) => setMode(value as "quick" | "full")}><TabsList><TabsTrigger value="quick">快速添加</TabsTrigger><TabsTrigger value="full">完整配置</TabsTrigger></TabsList></Tabs><Button type="button" onClick={props.close} variant="ghost" size="icon-sm" aria-label="关闭"><X /></Button></div></div>
    <div className="space-y-6 p-5"><Section title="这个 API 用来做什么"><div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{sourceOptions.filter((option) => props.canPublish || option.id !== "SERVER_LOCAL").map((option) => <button key={option.id} type="button" onClick={() => props.selectSource(option.id)} className={`min-h-28 rounded-[8px] border p-3 text-left transition ${props.sourceType === option.id ? "border-[var(--brand)] bg-[var(--brand-soft)] shadow-[inset_0_0_0_1px_var(--brand)]" : "border-[var(--line)] hover:bg-[var(--surface-subtle)]"}`}><span className={`grid size-8 place-items-center rounded-[8px] ${option.tone}`}><option.icon className="size-4" /></span><strong className="mt-3 block text-[11px]">{option.name}</strong><span className="mt-1 block text-[9px] leading-4 text-[var(--muted)]">{option.description}</span></button>)}</div></Section>
    <Section title="名称与公开路由"><div className={`grid gap-4 ${mode === "quick" ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}><Field label="API 名称"><input name="name" required minLength={2} value={name} onChange={(event) => changeName(event.target.value)} className={inputClass} placeholder="例如：随机风景图" /></Field><Field label="唯一标识"><input name="slug" required minLength={2} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={slug} onChange={(event) => changeSlug(event.target.value)} placeholder="自动生成" className={inputClass} /></Field>{mode === "quick" && publicPathField}</div>{mode === "full" ? <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{routeFields}</div> : <><input type="hidden" name="publicHost" value={publicHost} /><input type="hidden" name="version" value={version} /><input type="hidden" name="visibility" value="PUBLIC" /></>}<EndpointPath platformUrl={props.defaultPublicUrl} publicHost={publicHost} publicPath={publicPath} version={version} method={props.method} state={displayedRouteCheck} /></Section>
    <Section title="返回内容"><SourceFields {...props} quick={mode === "quick"} selectedTemplate={selectedTemplate} /></Section>
    <Section title="收费方式"><div className="grid gap-3 sm:grid-cols-2"><button type="button" onClick={() => props.setBillingMode("FREE")} className={`rounded-[8px] border p-4 text-left ${props.billingMode === "FREE" ? "border-[var(--brand)] bg-[var(--brand-soft)]" : "border-[var(--line)]"}`}><strong className="text-[11px]">免费调用</strong><span className="mt-1 block text-[9px] text-[var(--muted)]">仍会记录调用量并执行 QPS 和月配额限制。</span></button><button type="button" onClick={() => props.setBillingMode("PER_REQUEST")} className={`rounded-[8px] border p-4 text-left ${props.billingMode === "PER_REQUEST" ? "border-[var(--brand)] bg-[var(--brand-soft)]" : "border-[var(--line)]"}`}><strong className="text-[11px]">按成功请求收费</strong><span className="mt-1 block text-[9px] text-[var(--muted)]">只有 2xx/3xx 成功响应产生费用，失败请求不收费。</span></button></div>{props.billingMode === "PER_REQUEST" && <div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="单价（元/次）"><input name="unitPrice" required type="number" min="0.000001" step="0.000001" className={inputClass} placeholder="0.01" /></Field><Field label="每月免费次数" optional><input name="freeQuotaMonthly" type="number" min="0" defaultValue="0" className={inputClass} /></Field></div>}</Section>
    {mode === "full" ? <section className="rounded-[8px] border border-[var(--line)]"><button type="button" onClick={() => props.setAdvancedOpen(!props.advancedOpen)} className="flex w-full items-center justify-between px-4 py-3 text-left"><span><strong className="block text-[11px]">高级设置</strong><span className="mt-0.5 block text-[9px] text-[var(--muted)]">说明、分类、服务商、QPS、SLA 和安全策略均可按需配置</span></span><ChevronDown className={`size-4 transition ${props.advancedOpen ? "rotate-180" : ""}`} /></button>{props.advancedOpen && <AdvancedFields />}</section> : <div className="flex items-start gap-3 rounded-[8px] bg-[var(--aqua-soft)] px-4 py-3 text-[9px] leading-4 text-[var(--aqua)]"><ShieldCheck className="mt-0.5 size-4 shrink-0" /><span>默认启用调用日志与 CORS，QPS 为 10，版本为 v1，并根据部署地址自动决定是否强制 HTTPS。创建后可随时进入路由配置调整。</span></div>}
    {props.error && <p role="alert" className="rounded-[8px] bg-[var(--danger-soft)] px-3 py-2.5 text-[10px] text-[var(--danger)]">{props.error}</p>}</div><div className="flex justify-end gap-2 border-t border-[var(--line)] bg-[var(--surface-subtle)] px-5 py-4"><Button type="button" onClick={props.close} variant="secondary" size="sm">取消</Button><Button disabled={props.saving || displayedRouteCheck.status === "checking" || displayedRouteCheck.status === "conflict"} size="sm">{props.saving && <Loader2 className="animate-spin" />}{props.saving ? "正在创建" : "创建 API 草稿"}</Button></div></form></DialogContent></Dialog>;
}

function SourceFields(props: { sourceType: SourceType; quick: boolean; authType: string; setAuthType: (value: string) => void; builtinHandler: string; setBuiltinHandler: (value: string) => void; method: string; setMethod: (value: string) => void; selectedTemplate: typeof internalHandlerTemplates[number] }) {
  if (props.sourceType === "RANDOM_IMAGE") return <AssetPicker name="assets" accept="image/png,image/jpeg,image/webp,image/gif" multiple required title="选择本地图片" description="支持 PNG、JPEG、WebP、GIF，可多选；每张最大 8 MB" />;
  if (props.sourceType === "RANDOM_TEXT") return <div className="space-y-4"><Field label="文本内容"><textarea name="content" rows={7} className={textareaClass} placeholder={"每行一条内容\n调用时会随机返回其中一行\n也可以只上传 TXT 文件"} /></Field><Field label="上传 TXT 文件" optional><input name="assets" type="file" accept=".txt,text/plain" multiple className={inputClass} /></Field></div>;
  if (props.sourceType === "STATIC_JSON") return <div className="space-y-4"><Field label="JSON 内容"><textarea name="content" rows={9} className={`${textareaClass} mono`} placeholder={'{\n  "message": "hello",\n  "success": true\n}'} /></Field><Field label="或上传 JSON 文件" optional><input name="assets" type="file" accept=".json,application/json" className={inputClass} /></Field></div>;
  if (props.sourceType === "PHP_PACKAGE") return <div className="space-y-4"><label className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-[8px] border border-dashed border-[var(--line-strong)] bg-[var(--surface-subtle)] p-5 text-center hover:border-[var(--brand)]"><FileCode2 className="size-6 text-[var(--brand)]" /><strong className="mt-3 text-[11px]">选择 PHP 程序包</strong><span className="mt-1 text-[9px] text-[var(--muted)]">上传包含 PHP 源码与附属文件的 ZIP；程序在独立受限容器内运行</span><input name="assets" required type="file" accept=".zip,application/zip,application/x-zip-compressed" className="mt-3 block max-w-full text-[9px]" /></label><div className="grid gap-4 sm:grid-cols-2"><Field label="入口文件"><input name="entryFile" defaultValue="index.php" className={inputClass} placeholder="index.php" /></Field><Field label="接受的请求方法"><select value={props.method} onChange={(event) => props.setMethod(event.target.value)} className={inputClass}><option value="ALL">全部方法</option><option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option></select></Field></div></div>;
  if (["EXTERNAL", "SERVER_LOCAL", "TUNNEL"].includes(props.sourceType)) {
    const local = props.sourceType === "SERVER_LOCAL";
    const tunnel = props.sourceType === "TUNNEL";
    const address = <div className="sm:col-span-2"><Field label={local ? "Docker 内网基础地址" : tunnel ? "临时穿透地址" : "公网 API 基础地址"}><input name="upstreamBaseUrl" required type="url" placeholder={local ? "http://image-service:3000" : tunnel ? "https://example.ngrok.app" : "https://provider.example.com/api"} className={inputClass} /></Field></div>;
    const authentication = <><Field label="鉴权方式"><select value={props.authType} onChange={(event) => props.setAuthType(event.target.value)} className={inputClass}><option value="NONE">无需鉴权</option><option value="BEARER">Bearer Token</option><option value="HEADER">自定义请求头</option></select></Field>{props.authType === "BEARER" && <Field label="Bearer Token"><input name="upstreamToken" required type="password" autoComplete="off" className={inputClass} /></Field>}{props.authType === "HEADER" && <><Field label="请求头名称"><input name="upstreamHeaderName" required className={inputClass} placeholder="X-API-Key" /></Field><Field label="请求头值"><input name="upstreamHeaderValue" required type="password" autoComplete="off" className={inputClass} /></Field></>}</>;
    if (props.quick) return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{address}<Field label="请求方法"><select value={props.method} onChange={(event) => props.setMethod(event.target.value)} className={inputClass}><option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option></select></Field>{authentication}{local && <p className="sm:col-span-2 lg:col-span-3 rounded-[8px] bg-[var(--aqua-soft)] px-3 py-2 text-[9px] leading-4 text-[var(--aqua)]">填写已加入 Docker 网络并在 LOCAL_UPSTREAM_HOSTS 登记的服务名。不要填写 127.0.0.1，它只会指向平台容器自身。</p>}</div>;
    return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{address}<Field label="请求方法"><select value={props.method} onChange={(event) => props.setMethod(event.target.value)} className={inputClass}><option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option></select></Field><Field label="路径转发"><select name="rewriteMode" defaultValue="PASSTHROUGH" className={inputClass}><option value="PASSTHROUGH">完全透传</option><option value="PREFIX">增加上游前缀</option></select></Field><Field label="上游路径前缀" optional><input name="upstreamPrefix" className={inputClass} placeholder="/api" /></Field><Field label="健康检测路径"><input name="healthPath" defaultValue={local ? "/health" : "/"} className={inputClass} /></Field><Field label="请求数据格式"><select name="requestFormat" defaultValue="JSON" className={inputClass}><option value="JSON">JSON</option><option value="FORM">Form</option><option value="BINARY">二进制</option><option value="ANY">不限制</option></select></Field>{authentication}{local && <p className="sm:col-span-2 lg:col-span-3 rounded-[8px] bg-[var(--aqua-soft)] px-3 py-2 text-[9px] leading-4 text-[var(--aqua)]">填写已加入 Docker 网络并在 LOCAL_UPSTREAM_HOSTS 登记的服务名。不要填写 127.0.0.1，它只会指向平台容器自身。</p>}</div>;
  }
  return <div className="grid gap-4 sm:grid-cols-2"><Field label="内置工具"><select value={props.builtinHandler} onChange={(event) => props.setBuiltinHandler(event.target.value)} className={inputClass}>{internalHandlerTemplates.map((item) => <option key={item.id} value={item.id}>{item.name} - {item.description}</option>)}</select></Field><Field label="请求方法"><select value={props.method} onChange={(event) => props.setMethod(event.target.value)} className={inputClass}>{props.selectedTemplate.methods.map((item) => <option key={item}>{item}</option>)}</select></Field></div>;
}

function EndpointPath({ platformUrl, publicHost, publicPath, version, method, state }: { platformUrl: string; publicHost: string; publicPath: string; version: string; method: string; state: RouteCheckState }) {
  const publicUrl = buildPublicApiUrl({ platformUrl, publicHost: publicHost || "localhost", publicPath });
  const tone = state.status === "available" ? "text-[var(--success)]" : state.status === "conflict" ? "text-[var(--danger)]" : "text-[var(--muted)]";
  const StateIcon = state.status === "checking" ? Loader2 : state.status === "available" ? CheckCircle2 : state.status === "conflict" ? CircleAlert : Link2;
  return <div className="mt-3 flex flex-col gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface-subtle)] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-center gap-2"><span className="rounded-[6px] bg-[var(--brand-soft)] px-2 py-1 text-[8px] font-bold text-[var(--brand)]">{method}</span><code className="mono min-w-0 break-all text-[9px]">{publicUrl}</code><span className="shrink-0 text-[8px] text-[var(--muted)]">{version}</span></div><span role="status" className={`inline-flex shrink-0 items-center gap-1.5 text-[8px] ${tone}`}><StateIcon className={`size-3.5 ${state.status === "checking" ? "animate-spin" : ""}`} />{state.message}</span></div>;
}
function AdvancedFields() {
  return <div className="grid gap-4 border-t border-[var(--line)] p-4 sm:grid-cols-2 lg:grid-cols-4">
    <Field label="接口说明" optional><textarea name="description" rows={3} className={`${textareaClass} lg:min-h-24`} /></Field>
    <Field label="标签" optional><input name="tags" className={inputClass} placeholder="图片,随机,素材" /></Field>
    <Field label="能力分类" optional><select name="category" defaultValue="其他" className={inputClass}>{apiCategories.map((item) => <option key={item}>{item}</option>)}</select></Field>
    <Field label="服务商品牌" optional><input name="providerName" className={inputClass} placeholder="留空使用平台名称" /></Field>
    <Field label="服务商法定名称" optional><input name="providerLegalName" className={inputClass} /></Field>
    <Field label="服务商联系邮箱" optional><input name="providerEmail" type="email" className={inputClass} placeholder="留空使用管理员邮箱" /></Field>
    <Field label="默认 QPS" optional><input name="defaultQpsLimit" type="number" min="1" defaultValue="10" className={inputClass} /></Field>
    <Field label="单客户日上限" optional><input name="dailyLimit" type="number" min="0" defaultValue="0" className={inputClass} /></Field>
    <Field label="超时（毫秒）" optional><input name="timeoutMs" type="number" min="500" max="60000" defaultValue="10000" className={inputClass} /></Field>
    <Field label="IP 白名单" optional><input name="ipAllowlist" className={inputClass} placeholder="逗号分隔" /></Field>
    <Field label="IP 黑名单" optional><input name="ipDenylist" className={inputClass} placeholder="逗号分隔" /></Field>
    <Field label="承诺 SLA（%）" optional><input name="sla" type="number" min="0" max="100" step="0.001" defaultValue="99.9" className={inputClass} /></Field>
    <label className="flex items-center gap-2 text-[10px]"><input name="corsEnabled" type="checkbox" defaultChecked />允许跨域</label>
    <label className="flex items-center gap-2 text-[10px]"><input name="forceHttps" type="checkbox" defaultChecked />强制 HTTPS</label>
    <label className="flex items-center gap-2 text-[10px]"><input name="requestLogging" type="checkbox" defaultChecked />记录调用日志</label>
    <label className="flex items-center gap-2 text-[10px]"><input name="featured" type="checkbox" />首页推荐</label>
  </div>;
}

function ContentManager({ api, close, changed }: { api: CatalogProduct; close: () => void; changed: (count: number) => void }) {
  const [assets, setAssets] = useState<AssetView[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void fetch(`/api/v1/admin/apis/assets?productId=${encodeURIComponent(api.id)}`)
      .then((response) => response.json().then((result) => ({ response, result })))
      .then(({ response, result }) => { if (!active) return; if (response.ok) setAssets(result.data); else setError(result.message); })
      .catch(() => { if (active) setError("无法加载 API 内容"); });
    return () => { active = false; };
  }, [api.id]);
  async function add(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const formElement = event.currentTarget; setSaving(true); setError(""); const form = new FormData(formElement); form.append("productId", api.id); const response = await fetch("/api/v1/admin/apis/assets", { method: "POST", body: form }); const result = await response.json(); setSaving(false); if (!response.ok) { setError(result.message); return; } setMessage(result.message); formElement.reset(); const refreshed = await fetch(`/api/v1/admin/apis/assets?productId=${encodeURIComponent(api.id)}`); const refreshedResult = await refreshed.json(); if (refreshed.ok) { setAssets(refreshedResult.data); changed(refreshedResult.data.length); } }
  async function remove(asset: AssetView) { if (!window.confirm(`删除“${asset.preview || asset.name}”？`)) return; const response = await fetch(`/api/v1/admin/apis/assets?id=${encodeURIComponent(asset.id)}`, { method: "DELETE" }); const result = await response.json(); if (!response.ok) { setError(result.message); return; } setAssets((items) => { const next = items?.filter((item) => item.id !== asset.id) ?? []; changed(next.length); return next; }); setMessage(result.message); }
  const handler = api.internalHandler;
  return <div className="fixed inset-0 z-50 overflow-y-auto bg-black/45 p-4" onMouseDown={close}><div className="mx-auto my-6 w-full max-w-3xl overflow-hidden rounded-[8px] border border-[var(--line)] bg-[var(--surface)] shadow-2xl" onMouseDown={(event) => event.stopPropagation()}><div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4"><div><h3 className="text-[14px] font-bold">{handler === phpHandlerId ? "管理 PHP 程序包" : "管理返回内容"}</h3><p className="mt-1 text-[9px] text-[var(--muted)]">{api.name} · 当前 {assets?.length ?? api.assetCount} 项</p></div><button onClick={close} className="grid size-8 place-items-center rounded-[7px] hover:bg-[var(--surface-subtle)]" aria-label="关闭"><X className="size-4" /></button></div><form onSubmit={add} className="space-y-4 border-b border-[var(--line)] p-5">{handler === "content.random-image" && <Field label="继续添加图片"><input name="assets" required type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple className={inputClass} /></Field>}{handler === "content.random-text" && <><Field label="继续添加文本"><textarea name="content" rows={4} className={textareaClass} placeholder="每行一条" /></Field><Field label="或上传 TXT" optional><input name="assets" type="file" accept=".txt,text/plain" multiple className={inputClass} /></Field></>}{handler === "content.static-json" && <><Field label="替换 JSON 响应"><textarea name="content" rows={7} className={`${textareaClass} mono`} placeholder={'{"message":"updated"}'} /></Field><Field label="或上传 JSON" optional><input name="assets" type="file" accept=".json,application/json" className={inputClass} /></Field></>}{handler === phpHandlerId && <><Field label="替换整个 PHP 程序包"><input name="assets" required type="file" accept=".zip,application/zip,application/x-zip-compressed" className={inputClass} /></Field><Field label="入口文件"><input name="entryFile" defaultValue="index.php" className={inputClass} /></Field><p className="text-[9px] leading-4 text-[var(--muted)]">新 ZIP 校验通过后会原子替换当前程序包，不会留下新旧文件混用状态。</p></>}{message && <p role="status" className="rounded-[8px] bg-[var(--aqua-soft)] px-3 py-2 text-[10px] text-[var(--aqua)]">{message}</p>}{error && <p role="alert" className="rounded-[8px] bg-[var(--danger-soft)] px-3 py-2 text-[10px] text-[var(--danger)]">{error}</p>}<button disabled={saving} className="inline-flex h-9 items-center gap-2 rounded-[8px] bg-[var(--brand)] px-4 text-[10px] font-semibold text-white disabled:opacity-60">{saving ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}{handler === phpHandlerId ? "部署新程序包" : handler === "content.static-json" ? "更新 JSON" : "添加内容"}</button></form><div className="max-h-80 overflow-y-auto divide-y divide-[var(--line)]">{assets?.map((asset) => <div key={asset.id} className="flex items-center gap-3 px-5 py-3"><span className="grid size-8 shrink-0 place-items-center rounded-[8px] bg-[var(--surface-subtle)]">{asset.kind === "IMAGE" ? <FileImage className="size-4" /> : asset.kind === "JSON" ? <Braces className="size-4" /> : asset.kind === "PHP_SOURCE" ? <FileCode2 className="size-4" /> : <Type className="size-4" />}</span><div className="min-w-0 flex-1"><strong className="block truncate text-[10px]">{asset.preview || asset.name}</strong><span className="mt-0.5 block text-[8px] text-[var(--muted)]">{formatBytes(asset.size)} · {new Date(asset.createdAt).toLocaleString("zh-CN")}</span></div>{handler !== phpHandlerId && <button onClick={() => remove(asset)} className="grid size-8 place-items-center rounded-[7px] text-[var(--muted)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]" aria-label={`删除 ${asset.name}`}><Trash2 className="size-3.5" /></button>}</div>)}{assets?.length === 0 && <div className="py-12 text-center text-[10px] text-[var(--muted)]">当前没有可返回的内容</div>}{assets === null && !error && <div className="grid place-items-center py-12"><Loader2 className="size-5 animate-spin text-[var(--brand)]" /></div>}</div></div></div>;
}

function AssetPicker({ name, accept, multiple = false, required = false, title, description }: { name: string; accept: string; multiple?: boolean; required?: boolean; title: string; description: string }) {
  const [files, setFiles] = useState<File[]>([]);
  const selected = files.length > 0;
  return <label className="group block cursor-pointer rounded-[8px] outline-none focus-within:ring-2 focus-within:ring-[var(--brand-line)] focus-within:ring-offset-2 focus-within:ring-offset-[var(--surface)]">
    <input name={name} required={required} type="file" accept={accept} multiple={multiple} onChange={(event) => setFiles(Array.from(event.target.files ?? []))} className="sr-only" />
    <span className={`grid min-h-36 place-items-center rounded-[8px] border border-dashed p-5 text-center transition-[border-color,background-color,box-shadow] ${selected ? "border-[var(--brand)] bg-[var(--brand-soft)] shadow-[inset_0_0_0_1px_var(--brand-line)]" : "border-[var(--line-strong)] bg-[var(--surface-subtle)] group-hover:border-[var(--brand)] group-hover:bg-[var(--brand-soft)]"}`}>
      <span className="flex w-full max-w-lg flex-col items-center"><span className={`grid size-10 place-items-center rounded-[8px] ${selected ? "bg-[var(--surface)] text-[var(--success)] shadow-[var(--shadow-xs)]" : "bg-[var(--brand-soft)] text-[var(--brand)]"}`}>{selected ? <CheckCircle2 className="size-5" /> : <ImagePlus className="size-5" />}</span><strong className="mt-3 text-[11px]">{selected ? `${files.length} 张图片已就绪` : title}</strong><span className="mt-1 w-full truncate text-[9px] text-[var(--muted)]">{selected ? files.map((file) => file.name).join("、") : description}</span><span className="mt-3 inline-flex h-8 items-center rounded-[7px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[9px] font-semibold text-[var(--ink)] shadow-[var(--shadow-xs)]">{selected ? "重新选择" : "选择文件"}</span></span>
    </span>
  </label>;
}

function executionLabel(api: CatalogProduct) { if (api.internalHandler === "content.random-image") return "随机图片"; if (api.internalHandler === "content.random-text") return "随机文本"; if (api.internalHandler === "content.static-json") return "固定 JSON"; if (api.internalHandler === phpHandlerId) return "PHP 程序包"; if (api.upstreamType === "PUBLIC_API") return "公网 API"; if (api.upstreamType === "SERVER_LOCAL") return "服务器内网"; if (api.upstreamType === "TUNNEL") return "临时穿透"; return "内置工具"; }
function formatBytes(value: number) { if (value < 1024) return `${value} B`; if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`; return `${(value / 1024 / 1024).toFixed(1)} MB`; }
function Section({ title, children }: { title: string; children: React.ReactNode }) { return <section><h4 className="mb-3 text-[11px] font-bold">{title}</h4>{children}</section>; }
function Field({ label, optional = false, children }: { label: string; optional?: boolean; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold">{label}{optional && <em className="not-italic font-normal text-[var(--muted)]">可选</em>}</span>{children}</label>; }
