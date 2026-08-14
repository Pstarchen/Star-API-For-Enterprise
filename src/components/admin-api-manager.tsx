"use client";

import { Boxes, Braces, CheckCircle2, ChevronDown, CircleAlert, Database, Download, FileCode2, FileImage, FileVideo, Globe2, Library, Link2, Loader2, Plus, Search, Settings2, ShieldCheck, Tags, Trash2, Type, Upload, WandSparkles, X } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { apiDataTypes, apiHttpMethods, apiParameterLocations, apiResponseFormats, type ApiHttpMethod, type ApiRequestParameter, type ApiResponseFormat, type ApiResponseParameter } from "@/lib/api-contracts";
import { apiSlugFromName, buildPublicApiUrl, normalizePublicPath } from "@/lib/api-routes";
import type { ApiCategoryOption, CatalogProduct } from "@/lib/catalog";
import { internalHandlerTemplates, isAssetBackedHandler, phpHandlerId } from "@/lib/internal-handlers";
import { ApiConfigManager } from "@/components/api-config-manager";
import { ApiCategoryManager } from "@/components/api-category-manager";
import { OpenApiImportDialog } from "@/components/openapi-import-dialog";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { ConfirmDialog } from "./ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import { EmptyState } from "./ui/empty-state";
import { FileUploadField } from "./ui/file-upload";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow } from "./ui/table";

type SourceType = "RANDOM_IMAGE" | "RANDOM_VIDEO" | "RANDOM_TEXT" | "STATIC_JSON" | "DATASET" | "PHP_PACKAGE" | "EXTERNAL" | "SERVER_LOCAL" | "TUNNEL" | "BUILTIN";
type AssetView = { id: string; kind: string; name: string; mimeType: string; size: number; createdAt: string; preview: string | null };

const statusNames = { DRAFT: "草稿", REVIEW: "审核中", GRAY: "灰度中", PUBLISHED: "已发布", DEPRECATED: "已弃用", OFFLINE: "已下线" } as const;
const inputClass = "h-10 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[11px] outline-none focus:border-[var(--brand)]";
const textareaClass = "w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] p-3 text-[11px] leading-5 outline-none focus:border-[var(--brand)]";
const sourceOptions = [
  { id: "RANDOM_IMAGE", name: "随机图片", description: "上传多张图片，每次调用随机返回一张", icon: FileImage, tone: "bg-[var(--accent-soft)] text-[var(--accent)]" },
  { id: "RANDOM_VIDEO", name: "随机视频", description: "视频保存在服务器本地卷，支持分段播放与下载", icon: FileVideo, tone: "bg-[var(--warning-soft)] text-[var(--warning)]" },
  { id: "RANDOM_TEXT", name: "随机文本", description: "录入多行文本或上传 TXT，每次返回一条", icon: Type, tone: "bg-[var(--aqua-soft)] text-[var(--aqua)]" },
  { id: "STATIC_JSON", name: "固定 JSON", description: "配置一个 JSON 响应，适合公告和静态数据", icon: Braces, tone: "bg-[var(--brand-soft)] text-[var(--brand)]" },
  { id: "DATASET", name: "通用数据源", description: "导入结构化数据、逐行文本或 ZIP 数据包，自动生成可调用接口", icon: Database, tone: "bg-[var(--aqua-soft)] text-[var(--aqua)]" },
  { id: "PHP_PACKAGE", name: "PHP 程序包", description: "上传 PHP 与附属文件 ZIP，在隔离容器运行", icon: FileCode2, tone: "bg-[var(--brand-soft)] text-[var(--brand)]" },
  { id: "EXTERNAL", name: "外部 API", description: "代理已有接口并统一鉴权、限流和计费", icon: Globe2, tone: "bg-[var(--warning-soft)] text-[var(--warning)]" },
  { id: "SERVER_LOCAL", name: "服务器内网", description: "转发到 Docker 网络内已登记的本地服务", icon: Library, tone: "bg-[var(--aqua-soft)] text-[var(--aqua)]" },
  { id: "TUNNEL", name: "临时穿透", description: "接入 frp、ngrok 等临时调试地址", icon: Upload, tone: "bg-[var(--warning-soft)] text-[var(--warning)]" },
  { id: "BUILTIN", name: "内置工具", description: "时间、UUID、摘要和文本转换等工具", icon: WandSparkles, tone: "bg-[var(--surface-subtle)] text-[var(--ink)]" },
] as const;

type MediaUploadSummary = { uploaded: number; duplicates: number; skipped: string[] };

type ResponsePayload = {
  message?: string;
  data?: {
    duplicate?: boolean;
    archive?: boolean;
    uploaded?: number;
    duplicates?: number;
    deleted?: number;
    entryFile?: unknown;
    skipped?: Array<{ name?: string; message?: string }>;
  };
};

async function responsePayload(response: Response): Promise<ResponsePayload> {
  const source = await response.text();
  if (!source) return { message: response.ok ? "请求已完成" : `服务返回 HTTP ${response.status}` };
  try { return JSON.parse(source) as ResponsePayload; }
  catch { return { message: response.ok ? "服务返回了无法识别的结果" : response.status === 413 ? "文件超过反向代理允许的上传大小" : `上传服务返回 HTTP ${response.status}` }; }
}

async function uploadMediaFiles(productId: string, files: File[], progress: (uploaded: number, total: number, name: string) => void): Promise<MediaUploadSummary> {
  const summary: MediaUploadSummary = { uploaded: 0, duplicates: 0, skipped: [] };
  for (const [index, file] of files.entries()) {
    progress(index + 1, files.length, file.name);
    try {
      const response = await fetch(`/api/v1/admin/apis/media?productId=${encodeURIComponent(productId)}`, { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream", "X-File-Name": encodeURIComponent(file.name) }, body: file });
      const result = await responsePayload(response);
      if (!response.ok) {
        summary.skipped.push(`${file.name}：${result.message || "上传失败"}`);
        continue;
      }
      if (result.data?.archive) {
        summary.uploaded += Number(result.data.uploaded ?? 0);
        summary.duplicates += Number(result.data.duplicates ?? 0);
        for (const skipped of result.data.skipped ?? []) summary.skipped.push(`${skipped.name || file.name}：${skipped.message || "无法导入"}`);
      } else if (result.data?.duplicate) summary.duplicates += 1;
      else summary.uploaded += 1;
    } catch {
      summary.skipped.push(`${file.name}：无法连接媒体上传服务`);
    }
  }
  return summary;
}

function mediaUploadMessage(summary: MediaUploadSummary) {
  const parts = [`成功上传 ${summary.uploaded} 个文件`];
  if (summary.duplicates) parts.push(`跳过 ${summary.duplicates} 个重复文件`);
  if (summary.skipped.length) parts.push(`${summary.skipped.length} 个文件上传失败`);
  return parts.join("，");
}

export function AdminApiManager({ initialApis, initialCategories, defaultPublicHost, defaultPublicUrl, canPublish = true }: { initialApis: CatalogProduct[]; initialCategories: ApiCategoryOption[]; defaultPublicHost: string; defaultPublicUrl: string; canPublish?: boolean }) {
  const [apis, setApis] = useState(initialApis);
  const [categories, setCategories] = useState(initialCategories);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sourceType, setSourceType] = useState<SourceType>("RANDOM_IMAGE");
  const [authType, setAuthType] = useState("NONE");
  const [billingMode, setBillingMode] = useState<"FREE" | "PER_REQUEST">("FREE");
  const [builtinHandler, setBuiltinHandler] = useState<string>(internalHandlerTemplates[0].id);
  const [methods, setMethods] = useState<ApiHttpMethod[]>(["GET"]);
  const [parameters, setParameters] = useState<ApiRequestParameter[]>([]);
  const [responseParameters, setResponseParameters] = useState<ApiResponseParameter[]>([]);
  const [responseFormats, setResponseFormats] = useState<ApiResponseFormat[]>(["JSON"]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [contentApi, setContentApi] = useState<CatalogProduct | null>(null);
  const [configApi, setConfigApi] = useState<CatalogProduct | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<CatalogProduct | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return apis.filter((api) => (categoryFilter === "all" || api.categoryId === categoryFilter) && (!keyword || [api.name, api.slug, api.provider, api.category].join(" ").toLowerCase().includes(keyword)));
  }, [apis, categoryFilter, query]);

  function selectSource(next: SourceType) {
    setSourceType(next);
    setMethods(next === "PHP_PACKAGE" ? ["ALL"] : next === "DATASET" ? ["GET", "POST"] : next === "BUILTIN" ? [internalHandlerTemplates.find((item) => item.id === builtinHandler)?.methods[0] as ApiHttpMethod ?? "GET"] : ["GET"]);
    setResponseFormats(["RANDOM_IMAGE", "RANDOM_VIDEO"].includes(next) ? ["BINARY"] : next === "RANDOM_TEXT" ? ["TXT"] : next === "DATASET" ? ["TXT", "JSON"] : ["JSON"]);
    setParameters([]);
    setResponseParameters([]);
  }

  async function createApi(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setUploadProgress("");
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? "").trim();
    const quickMode = value("creationMode") === "quick";
    const config = {
      sourceType,
      name: value("name"),
      slug: value("slug"),
      description: value("description"),
      categoryId: value("categoryId"),
      tags: value("tags").split(",").map((item) => item.trim()).filter(Boolean),
      featured: form.get("featured") === "on",
      providerName: value("providerName"),
      providerLegalName: value("providerLegalName"),
      providerEmail: value("providerEmail"),
      version: value("version") || "v1",
      publicHost: value("publicHost"),
      publicPath: value("publicPath") || `/api/${value("slug")}`,
      visibility: value("visibility") || "PUBLIC",
      methods,
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
      rewriteMode: value("rewriteMode") || (quickMode && ["EXTERNAL", "TUNNEL"].includes(sourceType) ? "EXACT" : "PASSTHROUGH"),
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
      entryFile: value("entryFile"),
      parameters,
      responseParameters,
      responseFormats,
      ...(sourceType === "DATASET" ? { dataset: { grouping: value("datasetGrouping") || "MERGED", categoryParameter: value("datasetCategoryParameter"), formatParameter: value("datasetFormatParameter"), menuValue: value("datasetMenuValue"), defaultFormat: value("datasetDefaultFormat") || "JSON", textField: value("datasetTextField"), itemsPath: value("datasetItemsPath") } } : {}),
    };
    const payload = new FormData();
    payload.append("config", JSON.stringify(config));
    const mediaFiles = ["RANDOM_IMAGE", "RANDOM_VIDEO"].includes(sourceType) ? form.getAll("assets").filter((item): item is File => item instanceof File && item.size > 0) : [];
    if (!mediaFiles.length) for (const item of form.getAll("assets")) if (item instanceof File && item.size) payload.append("assets", item);
    try {
      const response = await fetch("/api/v1/admin/apis", { method: "POST", body: payload });
      const result = await response.json();
      if (!response.ok) {
        const fieldErrors = result.details?.fieldErrors ? Object.values(result.details.fieldErrors).flat().filter(Boolean).join("；") : "";
        setError(fieldErrors || result.message || "API 创建失败"); return;
      }
      let uploadSummary: MediaUploadSummary = { uploaded: 0, duplicates: 0, skipped: [] };
      if (mediaFiles.length) {
        uploadSummary = await uploadMediaFiles(result.data.id, mediaFiles, (current, total, name) => setUploadProgress(`正在上传 ${current} / ${total}：${name}`));
      }
      const uploaded = uploadSummary.uploaded;
      const created = { ...result.data, assetCount: uploaded || result.data.assetCount };
      setApis((current) => [created, ...current]);
      setNotice(uploaded || uploadSummary.duplicates || uploadSummary.skipped.length ? `${created.name} 已创建，${mediaUploadMessage(uploadSummary)}` : `${created.name} 已创建为草稿`);
      setDialogOpen(false);
      if (uploadSummary.skipped.length) setError(`API 草稿已保留；${uploadSummary.skipped.slice(0, 3).join("；")}${uploadSummary.skipped.length > 3 ? `；另有 ${uploadSummary.skipped.length - 3} 个文件上传失败` : ""}。可在“管理返回内容”中继续上传。`);
    } catch { setError("无法连接 API 管理服务"); }
    finally { setSaving(false); setUploadProgress(""); }
  }

  async function changeStatus(api: CatalogProduct, status: CatalogProduct["status"]) {
    const response = await fetch("/api/v1/admin/apis", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: api.id, status }) });
    const result = await response.json();
    if (!response.ok) { setError(result.message ?? "状态更新失败"); return; }
    setApis((current) => current.map((item) => item.id === api.id ? result.data : item));
    setNotice(`${api.name} 已更新为${statusNames[status]}`);
  }

  async function deleteApi() {
    if (!deleteTarget) return;
    setDeleting(true); setDeleteError("");
    try {
      const response = await fetch(`/api/v1/admin/apis?id=${encodeURIComponent(deleteTarget.id)}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) { setDeleteError(result.message ?? "删除失败"); return; }
      setApis((current) => current.filter((item) => item.id !== deleteTarget.id));
      setNotice(result.message || `${deleteTarget.name} 已删除`);
      setDeleteTarget(null);
    } catch { setDeleteError("无法连接 API 管理服务，请稍后重试"); }
    finally { setDeleting(false); }
  }

  function exportApis() {
    const rows = filtered.map((api) => [api.name, api.slug, api.provider, api.method, api.endpoint, executionLabel(api), api.price, statusNames[api.status]]);
    const csv = ["API,标识,服务商,方法,路径,来源,计费,状态", ...rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "star-api-list.csv"; link.click(); URL.revokeObjectURL(url);
  }

  return <div className="page-shell space-y-5">
    <div className="page-heading"><div><p className="eyebrow">API GOVERNANCE</p><h2 className="page-title mt-1">API 生命周期管理</h2><p className="page-description mt-1">上传内容、接入外部接口或选择内置工具，再统一配置免费或收费规则。</p></div><div className="flex flex-wrap gap-2">{canPublish && <Button onClick={() => setCategoryOpen(true)} variant="secondary" size="sm"><Tags />管理分类</Button>}<Button onClick={() => { setImportOpen(true); setError(""); }} variant="secondary" size="sm"><Upload />导入 OpenAPI</Button><Button onClick={() => { setDialogOpen(true); setError(""); }} size="sm"><Plus />新建 API</Button></div></div>
    {notice && <div role="status" className="flex items-center justify-between rounded-[8px] border border-[color-mix(in_srgb,var(--success)_25%,var(--line))] bg-[color-mix(in_srgb,var(--success)_7%,var(--surface))] px-3 py-2.5 text-[10px] text-[var(--success)]"><span className="inline-flex items-center gap-2"><CheckCircle2 className="size-3.5" />{notice}</span><button onClick={() => setNotice("")} aria-label="关闭提示"><X className="size-3.5" /></button></div>}
    {error && !dialogOpen && <p role="alert" className="rounded-[8px] bg-[var(--danger-soft)] px-3 py-2.5 text-[10px] text-[var(--danger)]">{error}</p>}
    <section className="panel overflow-hidden"><div className="flex flex-col gap-3 border-b border-[var(--line)] p-4 sm:flex-row"><label className="relative flex-1 sm:max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 z-10 size-3.5 -translate-y-1/2 text-[var(--muted)]" /><Input value={query} onChange={(event) => setQuery(event.target.value)} className="h-9 pl-9 text-[10px]" placeholder="名称、标识、服务商或分类" /></label><Select value={categoryFilter} onValueChange={setCategoryFilter}><SelectTrigger size="sm" className="w-full sm:w-36"><SelectValue placeholder="全部分类" /></SelectTrigger><SelectContent><SelectItem value="all">全部分类</SelectItem>{categories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}</SelectContent></Select><Button onClick={exportApis} disabled={!filtered.length} variant="secondary" size="sm"><Download />导出</Button></div>
      <TableContainer><Table className="min-w-[1080px]"><TableHeader><TableRow className="hover:bg-transparent"><TableHead className="px-4">API</TableHead><TableHead className="px-4">公开端点</TableHead><TableHead className="px-4">来源</TableHead><TableHead className="px-4">计费</TableHead><TableHead className="px-4">真实调用</TableHead><TableHead className="px-4">状态</TableHead><TableHead className="px-4 text-right">操作</TableHead></TableRow></TableHeader><TableBody>{filtered.map((api) => <TableRow key={api.id}>
            <TableCell className="px-4"><strong className="block">{api.name}</strong><small className="text-[8px] text-[var(--muted)]">{api.category} · {api.provider} · {api.slug}</small></TableCell>
            <TableCell className="px-4"><strong className="text-[var(--brand)]">{api.method}</strong><code className="mono ml-2 text-[9px]">{buildPublicApiUrl({ platformUrl: defaultPublicUrl, publicHost: api.publicHost, publicPath: api.endpoint })}</code></TableCell>
            <TableCell className="px-4"><span className="block">{executionLabel(api)}</span>{isAssetBackedHandler(api.internalHandler) && <span className="mt-1 block text-[8px] text-[var(--muted)]">{api.assetCount} 个文件/内容项</span>}</TableCell>
            <TableCell className="px-4">{api.price}</TableCell><TableCell className="px-4"><strong className="block text-[11px]">{api.calls.toLocaleString("zh-CN")} 次</strong><span className="mt-1 block text-[8px] text-[var(--muted)]">今日 {api.todayCalls.toLocaleString("zh-CN")} · {api.uptime == null ? "暂无成功率" : `${api.uptime}% 成功`} · {api.latency == null ? "暂无延迟" : `${api.latency} ms`}</span></TableCell>
            <TableCell className="px-4"><Select value={api.status} onValueChange={(value) => changeStatus(api, value as CatalogProduct["status"])}><SelectTrigger size="sm" className="w-24"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="DRAFT">草稿</SelectItem><SelectItem value="REVIEW">审核中</SelectItem>{canPublish && <><SelectItem value="GRAY">灰度中</SelectItem><SelectItem value="PUBLISHED">已发布</SelectItem><SelectItem value="DEPRECATED">已弃用</SelectItem></>}<SelectItem value="OFFLINE">已下线</SelectItem></SelectContent></Select></TableCell>
            <TableCell className="px-4"><div className="flex justify-end gap-1"><Button onClick={() => setConfigApi(api)} variant="ghost" size="icon-sm" title="配置路由与上游" aria-label={`配置 ${api.name}`}><Settings2 /></Button>{isAssetBackedHandler(api.internalHandler) && <Button onClick={() => setContentApi(api)} variant="ghost" size="icon-sm" title="管理返回内容" aria-label={`管理 ${api.name} 的内容`}><Library /></Button>}<Button onClick={() => { setDeleteTarget(api); setDeleteError(""); }} variant="ghost" size="icon-sm" className="hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]" title="删除 API" aria-label={`删除 ${api.name}`}><Trash2 /></Button></div></TableCell>
          </TableRow>)}</TableBody></Table></TableContainer>
      {!filtered.length && <EmptyState icon={Boxes} title="暂无 API" description="可以从随机图片、文本、JSON 或外部接口开始创建。" />}
      <div className="border-t border-[var(--line)] px-4 py-3 text-[9px] text-[var(--muted)]">共 {filtered.length} 条真实记录</div>
    </section>
    {dialogOpen && <CreateDialog categories={categories.filter((category) => category.enabled)} canPublish={canPublish} defaultPublicHost={defaultPublicHost} defaultPublicUrl={defaultPublicUrl} sourceType={sourceType} selectSource={selectSource} authType={authType} setAuthType={setAuthType} billingMode={billingMode} setBillingMode={setBillingMode} builtinHandler={builtinHandler} setBuiltinHandler={(id) => { setBuiltinHandler(id); setMethods([internalHandlerTemplates.find((item) => item.id === id)?.methods[0] as ApiHttpMethod ?? "GET"]); }} methods={methods} setMethods={setMethods} parameters={parameters} setParameters={setParameters} responseParameters={responseParameters} setResponseParameters={setResponseParameters} responseFormats={responseFormats} setResponseFormats={setResponseFormats} advancedOpen={advancedOpen} setAdvancedOpen={setAdvancedOpen} saving={saving} uploadProgress={uploadProgress} error={error} close={() => setDialogOpen(false)} submit={createApi} />}
    {contentApi && <ContentManager api={contentApi} close={() => setContentApi(null)} changed={(count) => setApis((items) => items.map((item) => item.id === contentApi.id ? { ...item, assetCount: count } : item))} />}
    {configApi && <ApiConfigManager api={configApi} categories={categories} close={() => setConfigApi(null)} updated={(next) => { setApis((items) => items.some((item) => item.id === next.id) ? items.map((item) => item.id === next.id ? next : item) : [next, ...items]); setConfigApi(next); }} />}
    {importOpen && <OpenApiImportDialog categories={categories.filter((category) => category.enabled)} defaultPublicHost={defaultPublicHost} close={() => setImportOpen(false)} imported={(next, message) => { setApis((items) => [next, ...items]); setNotice(message); setImportOpen(false); }} />}
    {categoryOpen && (
      <ApiCategoryManager
        categories={categories}
        close={() => setCategoryOpen(false)}
        changed={(nextCategories) => {
          setCategories(nextCategories);
          setApis((items) => items.map((api) => ({
            ...api,
            category: nextCategories.find((category) => category.id === api.categoryId)?.name ?? api.category,
          })));
        }}
      />
    )}
    {deleteTarget && <ConfirmDialog open title={`删除 ${deleteTarget.name}？`} description="删除后将无法恢复该 API、路由和返回内容。" detail="已下线 API 的应用订阅会同时取消，历史调用和账单记录仍会保留。" busy={deleting} error={deleteError} onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setDeleteError(""); } }} onConfirm={deleteApi} />}
  </div>;
}

type RouteCheckState = { status: "idle" | "checking" | "available" | "conflict" | "error"; message: string };

function CreateDialog(props: { categories: ApiCategoryOption[]; canPublish: boolean; defaultPublicHost: string; defaultPublicUrl: string; sourceType: SourceType; selectSource: (value: SourceType) => void; authType: string; setAuthType: (value: string) => void; billingMode: "FREE" | "PER_REQUEST"; setBillingMode: (value: "FREE" | "PER_REQUEST") => void; builtinHandler: string; setBuiltinHandler: (value: string) => void; methods: ApiHttpMethod[]; setMethods: (value: ApiHttpMethod[]) => void; parameters: ApiRequestParameter[]; setParameters: (value: ApiRequestParameter[]) => void; responseParameters: ApiResponseParameter[]; setResponseParameters: (value: ApiResponseParameter[]) => void; responseFormats: ApiResponseFormat[]; setResponseFormats: (value: ApiResponseFormat[]) => void; advancedOpen: boolean; setAdvancedOpen: (value: boolean) => void; saving: boolean; uploadProgress: string; error: string; close: () => void; submit: (event: FormEvent<HTMLFormElement>) => void }) {
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
  const defaultCategoryId = props.categories.find((item) => item.name === "其他")?.id ?? props.categories[0]?.id ?? "";
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
      const query = new URLSearchParams({ host: publicHost, path: publicPath, version, methods: props.methods.join(","), slug });
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
  }, [props.methods, publicHost, publicPath, routeInputValid, slug, version]);

  const publicPathField = <Field label="公开路径"><input name="publicPath" required value={publicPath} onChange={(event) => { setPathEdited(true); setPublicPath(event.target.value); }} onBlur={() => setPublicPath(normalizePublicPath(publicPath))} className={inputClass} placeholder="/api/sjbz" /></Field>;
  const routeFields = <>
    <Field label="访问域名"><input name="publicHost" required value={publicHost} onChange={(event) => setPublicHost(event.target.value.toLowerCase())} className={inputClass} placeholder="example.com" /></Field>
    {publicPathField}
    <Field label="接口版本"><input name="version" value={version} onChange={(event) => setVersion(event.target.value)} className={inputClass} /></Field>
    <Field label="可见范围"><Select name="visibility" defaultValue="PUBLIC"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="PUBLIC">公开市场</SelectItem><SelectItem value="PRIVATE">指定企业</SelectItem><SelectItem value="GRAY">灰度测试</SelectItem><SelectItem value="INTERNAL">仅内部网关</SelectItem></SelectContent></Select></Field>
  </>;

  return <Dialog open onOpenChange={(open) => { if (!open) props.close(); }}><DialogContent className="w-[min(calc(100%-24px),1024px)] p-0" showClose={false}><form onSubmit={props.submit}><input type="hidden" name="creationMode" value={mode} /><div className="flex flex-col gap-4 border-b border-[var(--line)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><DialogTitle className="text-[15px]">创建一个可调用的 API</DialogTitle><DialogDescription>快速添加使用安全默认值，完整配置保留全部网关能力。</DialogDescription></div><div className="flex items-center gap-2"><Tabs value={mode} onValueChange={(value) => setMode(value as "quick" | "full")}><TabsList><TabsTrigger value="quick">快速添加</TabsTrigger><TabsTrigger value="full">完整配置</TabsTrigger></TabsList></Tabs><Button type="button" onClick={props.close} variant="ghost" size="icon-sm" aria-label="关闭"><X /></Button></div></div>
    <div className="space-y-6 p-5"><Section title="这个 API 用来做什么"><div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{sourceOptions.filter((option) => props.canPublish || !["SERVER_LOCAL", "PHP_PACKAGE"].includes(option.id)).map((option) => <button key={option.id} type="button" onClick={() => props.selectSource(option.id)} className={`min-h-28 rounded-[8px] border p-3 text-left transition ${props.sourceType === option.id ? "border-[var(--brand)] bg-[var(--brand-soft)] shadow-[inset_0_0_0_1px_var(--brand)]" : "border-[var(--line)] hover:bg-[var(--surface-subtle)]"}`}><span className={`grid size-8 place-items-center rounded-[8px] ${option.tone}`}><option.icon className="size-4" /></span><strong className="mt-3 block text-[11px]">{option.name}</strong><span className="mt-1 block text-[9px] leading-4 text-[var(--muted)]">{option.description}</span></button>)}</div></Section>
    <Section title="名称与公开路由"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Field label="API 名称"><input name="name" required minLength={2} value={name} onChange={(event) => changeName(event.target.value)} className={inputClass} placeholder="例如：随机风景图" /></Field><Field label="唯一标识"><input name="slug" required minLength={2} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={slug} onChange={(event) => changeSlug(event.target.value)} placeholder="自动生成" className={inputClass} /></Field><Field label="能力分类"><Select name="categoryId" required defaultValue={defaultCategoryId}><SelectTrigger className="w-full"><SelectValue placeholder="选择分类" /></SelectTrigger><SelectContent>{props.categories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}</SelectContent></Select></Field>{mode === "quick" && publicPathField}</div>{mode === "full" ? <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{routeFields}</div> : <><input type="hidden" name="publicHost" value={publicHost} /><input type="hidden" name="version" value={version} /><input type="hidden" name="visibility" value="PUBLIC" /></>}<EndpointPath platformUrl={props.defaultPublicUrl} publicHost={publicHost} publicPath={publicPath} version={version} methods={props.methods} state={displayedRouteCheck} /></Section>
    <Section title="返回内容"><SourceFields {...props} quick={mode === "quick"} selectedTemplate={selectedTemplate} /></Section>
    <Section title="接口契约"><ContractEditor sourceType={props.sourceType} selectedTemplate={selectedTemplate} methods={props.methods} setMethods={props.setMethods} parameters={props.parameters} setParameters={props.setParameters} responseParameters={props.responseParameters} setResponseParameters={props.setResponseParameters} responseFormats={props.responseFormats} setResponseFormats={props.setResponseFormats} /></Section>
    <Section title="收费方式"><div className="grid gap-3 sm:grid-cols-2"><button type="button" onClick={() => props.setBillingMode("FREE")} className={`rounded-[8px] border p-4 text-left ${props.billingMode === "FREE" ? "border-[var(--brand)] bg-[var(--brand-soft)]" : "border-[var(--line)]"}`}><strong className="text-[11px]">免费调用</strong><span className="mt-1 block text-[9px] text-[var(--muted)]">仍会记录调用量并执行 QPS 和月配额限制。</span></button><button type="button" onClick={() => props.setBillingMode("PER_REQUEST")} className={`rounded-[8px] border p-4 text-left ${props.billingMode === "PER_REQUEST" ? "border-[var(--brand)] bg-[var(--brand-soft)]" : "border-[var(--line)]"}`}><strong className="text-[11px]">按成功请求收费</strong><span className="mt-1 block text-[9px] text-[var(--muted)]">只有 2xx/3xx 成功响应产生费用，失败请求不收费。</span></button></div>{props.billingMode === "PER_REQUEST" && <div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="单价（元/次）"><input name="unitPrice" required type="number" min="0.000001" step="0.000001" className={inputClass} placeholder="0.01" /></Field><Field label="每月免费次数" optional><input name="freeQuotaMonthly" type="number" min="0" defaultValue="0" className={inputClass} /></Field></div>}</Section>
    {mode === "full" ? <section className="rounded-[8px] border border-[var(--line)]"><button type="button" onClick={() => props.setAdvancedOpen(!props.advancedOpen)} className="flex w-full items-center justify-between px-4 py-3 text-left"><span><strong className="block text-[11px]">高级设置</strong><span className="mt-0.5 block text-[9px] text-[var(--muted)]">说明、分类、服务商、QPS、SLA 和安全策略均可按需配置</span></span><ChevronDown className={`size-4 transition ${props.advancedOpen ? "rotate-180" : ""}`} /></button>{props.advancedOpen && <AdvancedFields />}</section> : <div className="flex items-start gap-3 rounded-[8px] bg-[var(--aqua-soft)] px-4 py-3 text-[9px] leading-4 text-[var(--aqua)]"><ShieldCheck className="mt-0.5 size-4 shrink-0" /><span>默认启用调用日志与 CORS，QPS 为 10，版本为 v1，并根据部署地址自动决定是否强制 HTTPS。创建后可随时进入路由配置调整。</span></div>}
    {props.uploadProgress && <p role="status" className="rounded-[8px] bg-[var(--aqua-soft)] px-3 py-2.5 text-[10px] text-[var(--aqua)]">{props.uploadProgress}</p>}{props.error && <p role="alert" className="rounded-[8px] bg-[var(--danger-soft)] px-3 py-2.5 text-[10px] text-[var(--danger)]">{props.error}</p>}</div><div className="flex justify-end gap-2 border-t border-[var(--line)] bg-[var(--surface-subtle)] px-5 py-4"><Button type="button" onClick={props.close} disabled={props.saving} variant="secondary" size="sm">取消</Button><Button disabled={props.saving || displayedRouteCheck.status === "checking" || displayedRouteCheck.status === "conflict"} size="sm">{props.saving && <Loader2 className="animate-spin" />}{props.uploadProgress ? "正在上传媒体" : props.saving ? "正在创建" : "创建 API 草稿"}</Button></div></form></DialogContent></Dialog>;
}

function SourceFields(props: { sourceType: SourceType; quick: boolean; authType: string; setAuthType: (value: string) => void; builtinHandler: string; setBuiltinHandler: (value: string) => void; selectedTemplate: typeof internalHandlerTemplates[number] }) {
  if (props.sourceType === "RANDOM_IMAGE") return <AssetPicker name="assets" accept="*/*" multiple required title="选择图片或 ZIP" description="支持单张、多选或 ZIP；管理员文件直接保存，重复内容自动跳过" icon={<FileImage />} />;
  if (props.sourceType === "RANDOM_VIDEO") return <AssetPicker name="assets" accept="*/*" multiple required title="选择视频或 ZIP" description="支持单个、多选或 ZIP；管理员文件直接保存，重复内容自动跳过并支持 Range 播放" icon={<FileVideo />} />;
  if (props.sourceType === "RANDOM_TEXT") return <div className="space-y-4"><Field label="文本内容"><textarea name="content" rows={7} className={textareaClass} placeholder={"每行一条内容\n调用时会随机返回其中一行\n也可以只上传 TXT 文件"} /></Field><FileUploadField name="assets" accept=".txt,text/plain" multiple title="上传 TXT 文件（可选）" description="支持选择一个或多个纯文本文件；每个非空行会成为一条随机返回内容" icon={<Type />} /></div>;
  if (props.sourceType === "STATIC_JSON") return <div className="space-y-4"><Field label="JSON 内容"><textarea name="content" rows={9} className={`${textareaClass} mono`} placeholder={'{\n  "message": "hello",\n  "success": true\n}'} /></Field><FileUploadField name="assets" accept=".json,application/json" title="上传 JSON 文件（可选）" description="选择文件后将校验 JSON 语法；文本框内容与文件二选一即可" icon={<Braces />} /></div>;
  if (props.sourceType === "DATASET") return <div className="space-y-4"><FileUploadField name="assets" required accept="*/*" multiple title="导入本地数据文件或 ZIP" description="支持 JSON、JSONL、CSV、TSV、YAML、逐行文本及其 ZIP 数据包；未知扩展名会按真实内容识别" icon={<Database />} /><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Field label="多文件组织方式"><Select name="datasetGrouping" defaultValue="FILE"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="FILE">按文件名分组</SelectItem><SelectItem value="MERGED">合并为一个内容池</SelectItem></SelectContent></Select></Field><Field label="分类参数名" optional><input name="datasetCategoryParameter" defaultValue="category" className={inputClass} placeholder="留空不启用分类" /></Field><Field label="格式参数名" optional><input name="datasetFormatParameter" defaultValue="format" className={inputClass} placeholder="留空使用 Accept 请求头" /></Field><Field label="分类列表触发值" optional><input name="datasetMenuValue" defaultValue="list" className={inputClass} placeholder="留空不提供列表值" /></Field><Field label="默认返回格式"><Select name="datasetDefaultFormat" defaultValue="JSON"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="JSON">JSON</SelectItem><SelectItem value="TXT">TXT</SelectItem></SelectContent></Select></Field><Field label="文本字段路径" optional><input name="datasetTextField" className={inputClass} placeholder="例如 content.text；留空自动识别" /></Field><Field label="记录集合路径" optional><input name="datasetItemsPath" className={inputClass} placeholder="例如 data.items；留空自动查找" /></Field></div><p className="text-[9px] leading-4 text-[var(--muted)]">不填写请求与返回参数时，平台会从真实记录自动生成可编辑契约和返回示例。ZIP 内可放多级目录和不同数据格式，目录与文件名仅用于分组，不限制业务字段。</p></div>;
  if (props.sourceType === "PHP_PACKAGE") return <div className="space-y-4"><FileUploadField name="assets" required accept=".zip,.php,application/zip,application/x-zip-compressed,application/x-httpd-php,text/x-php,text/plain" title="选择 PHP 程序包或单个 PHP 文件" description="支持 ZIP 程序包，也支持直接上传 index.php；程序会在独立受限容器内运行" icon={<FileCode2 />} /><Field label="入口文件" optional><input name="entryFile" className={inputClass} placeholder="留空自动发现，例如 project/index.php" /></Field><p className="text-[9px] leading-4 text-[var(--muted)]">ZIP 可以包含一层或多层项目目录。留空时平台会查找唯一入口或 index.php、api.php、main.php、app.php。</p></div>;
  if (["EXTERNAL", "SERVER_LOCAL", "TUNNEL"].includes(props.sourceType)) {
    const local = props.sourceType === "SERVER_LOCAL";
    const tunnel = props.sourceType === "TUNNEL";
    const address = <div className="sm:col-span-2"><Field label={local ? "Docker 内网基础地址" : tunnel ? "临时穿透地址" : "公网 API 完整 URL 或基础地址"}><input name="upstreamBaseUrl" required type="url" placeholder={local ? "http://image-service:3000" : tunnel ? "https://example.ngrok.app" : "https://provider.example.com/api?sample=value"} className={inputClass} /></Field></div>;
    const authentication = <><Field label="鉴权方式"><Select value={props.authType} onValueChange={props.setAuthType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="NONE">无需鉴权</SelectItem><SelectItem value="BEARER">Bearer Token</SelectItem><SelectItem value="HEADER">自定义请求头</SelectItem></SelectContent></Select></Field>{props.authType === "BEARER" && <Field label="Bearer Token"><input name="upstreamToken" required type="password" autoComplete="off" className={inputClass} /></Field>}{props.authType === "HEADER" && <><Field label="请求头名称"><input name="upstreamHeaderName" required className={inputClass} placeholder="X-API-Key" /></Field><Field label="请求头值"><input name="upstreamHeaderValue" required type="password" autoComplete="off" className={inputClass} /></Field></>}</>;
    if (props.quick) return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{address}{authentication}{local && <p className="sm:col-span-2 lg:col-span-3 rounded-[8px] bg-[var(--aqua-soft)] px-3 py-2 text-[9px] leading-4 text-[var(--aqua)]">填写已加入 Docker 网络并在 LOCAL_UPSTREAM_HOSTS 登记的服务名。不要填写 127.0.0.1，它只会指向平台容器自身。</p>}</div>;
    return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{address}<Field label="路径转发"><Select name="rewriteMode" defaultValue={local ? "PASSTHROUGH" : "EXACT"}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="EXACT">固定完整上游地址</SelectItem><SelectItem value="PASSTHROUGH">透传公开路径</SelectItem><SelectItem value="PREFIX">增加上游前缀</SelectItem></SelectContent></Select></Field><Field label="上游路径前缀" optional><input name="upstreamPrefix" className={inputClass} placeholder="/api" /></Field><Field label="健康检测路径"><input name="healthPath" defaultValue={local ? "/health" : "/"} className={inputClass} /></Field><Field label="请求数据格式"><Select name="requestFormat" defaultValue="JSON"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="JSON">JSON</SelectItem><SelectItem value="FORM">Form</SelectItem><SelectItem value="BINARY">二进制</SelectItem><SelectItem value="ANY">不限制</SelectItem></SelectContent></Select></Field>{authentication}{local && <p className="sm:col-span-2 lg:col-span-3 rounded-[8px] bg-[var(--aqua-soft)] px-3 py-2 text-[9px] leading-4 text-[var(--aqua)]">填写已加入 Docker 网络并在 LOCAL_UPSTREAM_HOSTS 登记的服务名。不要填写 127.0.0.1，它只会指向平台容器自身。</p>}</div>;
  }
  return <Field label="内置工具"><Select value={props.builtinHandler} onValueChange={props.setBuiltinHandler}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{internalHandlerTemplates.map((item) => <SelectItem key={item.id} value={item.id}>{item.name} - {item.description}</SelectItem>)}</SelectContent></Select></Field>;
}

function EndpointPath({ platformUrl, publicHost, publicPath, version, methods, state }: { platformUrl: string; publicHost: string; publicPath: string; version: string; methods: string[]; state: RouteCheckState }) {
  const publicUrl = buildPublicApiUrl({ platformUrl, publicHost: publicHost || "localhost", publicPath });
  const tone = state.status === "available" ? "text-[var(--success)]" : state.status === "conflict" ? "text-[var(--danger)]" : "text-[var(--muted)]";
  const StateIcon = state.status === "checking" ? Loader2 : state.status === "available" ? CheckCircle2 : state.status === "conflict" ? CircleAlert : Link2;
  return <div className="mt-3 flex flex-col gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface-subtle)] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-center gap-2"><span className="rounded-[6px] bg-[var(--brand-soft)] px-2 py-1 text-[8px] font-bold text-[var(--brand)]">{methods.join(" / ")}</span><code className="mono min-w-0 break-all text-[9px]">{publicUrl}</code><span className="shrink-0 text-[8px] text-[var(--muted)]">{version}</span></div><span role="status" className={`inline-flex shrink-0 items-center gap-1.5 text-[8px] ${tone}`}><StateIcon className={`size-3.5 ${state.status === "checking" ? "animate-spin" : ""}`} />{state.message}</span></div>;
}

function ContractEditor(props: { sourceType: SourceType; selectedTemplate: typeof internalHandlerTemplates[number]; methods: ApiHttpMethod[]; setMethods: (value: ApiHttpMethod[]) => void; parameters: ApiRequestParameter[]; setParameters: (value: ApiRequestParameter[]) => void; responseParameters: ApiResponseParameter[]; setResponseParameters: (value: ApiResponseParameter[]) => void; responseFormats: ApiResponseFormat[]; setResponseFormats: (value: ApiResponseFormat[]) => void }) {
  const allowedMethods = props.sourceType === "PHP_PACKAGE" ? apiHttpMethods : props.sourceType === "BUILTIN" ? props.selectedTemplate.methods : apiHttpMethods.filter((method) => method !== "ALL");
  function toggleMethod(method: ApiHttpMethod, checked: boolean) {
    if (method === "ALL") { props.setMethods(checked ? ["ALL"] : ["GET"]); return; }
    const current = props.methods.filter((item) => item !== "ALL");
    const next = checked ? [...current, method] : current.filter((item) => item !== method);
    props.setMethods((next.length ? apiHttpMethods.filter((item) => item !== "ALL" && next.includes(item)) : [method]) as ApiHttpMethod[]);
  }
  function toggleFormat(format: ApiResponseFormat, checked: boolean) {
    const next = checked ? [...props.responseFormats, format] : props.responseFormats.filter((item) => item !== format);
    props.setResponseFormats((next.length ? apiResponseFormats.filter((item) => next.includes(item)) : [format]) as ApiResponseFormat[]);
  }
  const updateParameter = (index: number, patch: Partial<ApiRequestParameter>) => props.setParameters(props.parameters.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const updateResponse = (index: number, patch: Partial<ApiResponseParameter>) => props.setResponseParameters(props.responseParameters.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  return <div className="space-y-6">
    <div className="grid gap-5 lg:grid-cols-2"><ChoiceGroup label="请求方法">{allowedMethods.map((method) => <Choice key={method} label={method === "ALL" ? "全部方法" : method} checked={props.methods.includes(method)} onCheckedChange={(checked) => toggleMethod(method as ApiHttpMethod, checked)} />)}</ChoiceGroup><ChoiceGroup label="返回格式">{apiResponseFormats.map((format) => <Choice key={format} label={format === "BINARY" ? "二进制 / 媒体" : format} checked={props.responseFormats.includes(format)} onCheckedChange={(checked) => toggleFormat(format, checked)} />)}</ChoiceGroup></div>
    <ContractTable title="请求参数" description={props.sourceType === "DATASET" ? "留空会从数据字段自动生成可选筛选参数；手工添加后以当前表格为准。" : "用于文档、调试和网关校验；不需要参数时可以留空。"} addLabel="添加请求参数" onAdd={() => props.setParameters([...props.parameters, { location: "QUERY", name: "", upstreamName: "", required: false, dataType: "string", defaultValue: "", description: "", pattern: "", sensitive: false }])} headers={["位置", "名称", "必填", "类型", "默认值", "说明", props.sourceType === "DATASET" ? "数据字段" : "上游字段", ""]} empty={props.sourceType === "DATASET" ? "创建时将自动识别数据字段；也可以先手工定义参数。" : "没有请求参数时可以留空。"}>{props.parameters.map((parameter, index) => <tr key={parameter.id ?? index} className="border-t border-[var(--line)]"><td className="p-2"><CompactSelect value={parameter.location} options={apiParameterLocations} change={(location) => updateParameter(index, { location: location as ApiRequestParameter["location"] })} /></td><td className="p-2"><input value={parameter.name} onChange={(event) => updateParameter(index, { name: event.target.value })} className={inputClass} placeholder="name" /></td><td className="p-2 text-center"><Checkbox checked={parameter.required} onCheckedChange={(checked) => updateParameter(index, { required: checked === true })} aria-label={`参数 ${parameter.name || index + 1} 是否必填`} /></td><td className="p-2"><CompactSelect value={parameter.dataType} options={apiDataTypes} change={(dataType) => updateParameter(index, { dataType: dataType as ApiRequestParameter["dataType"] })} /></td><td className="p-2"><input value={parameter.defaultValue} onChange={(event) => updateParameter(index, { defaultValue: event.target.value })} className={inputClass} placeholder="可空" /></td><td className="p-2"><input value={parameter.description} onChange={(event) => updateParameter(index, { description: event.target.value })} className={inputClass} placeholder="参数用途和可选值" /></td><td className="p-2"><input value={parameter.upstreamName} onChange={(event) => updateParameter(index, { upstreamName: event.target.value })} className={inputClass} placeholder={props.sourceType === "DATASET" ? "例如 metadata.region" : "可空"} /></td><td className="p-2"><IconDelete label="删除请求参数" click={() => props.setParameters(props.parameters.filter((_, itemIndex) => itemIndex !== index))} /></td></tr>)}</ContractTable>
    <ContractTable title="返回参数" description={props.sourceType === "DATASET" ? "留空会从真实样本自动识别字段和类型，返回示例始终取自已导入内容。" : "JSON 示例将根据字段类型自动生成；TXT 可直接使用第一项说明作为示例。"} addLabel="添加返回参数" onAdd={() => props.setResponseParameters([...props.responseParameters, { name: "", dataType: "string", description: "" }])} headers={["名称", "类型", "说明", ""]} empty={props.sourceType === "DATASET" ? "创建时将自动识别返回结构；标量内容会使用 value 字段描述。" : "媒体或纯文本接口可以不定义返回字段。"}>{props.responseParameters.map((parameter, index) => <tr key={parameter.id ?? index} className="border-t border-[var(--line)]"><td className="p-2"><input value={parameter.name} onChange={(event) => updateResponse(index, { name: event.target.value })} className={inputClass} placeholder="data" /></td><td className="p-2"><CompactSelect value={parameter.dataType} options={apiDataTypes} change={(dataType) => updateResponse(index, { dataType: dataType as ApiResponseParameter["dataType"] })} /></td><td className="p-2"><input value={parameter.description} onChange={(event) => updateResponse(index, { description: event.target.value })} className={inputClass} placeholder="返回字段说明" /></td><td className="p-2"><IconDelete label="删除返回参数" click={() => props.setResponseParameters(props.responseParameters.filter((_, itemIndex) => itemIndex !== index))} /></td></tr>)}</ContractTable>
  </div>;
}

function ChoiceGroup({ label, children }: { label: string; children: React.ReactNode }) { return <div><p className="mb-2 text-[10px] font-semibold">{label}</p><div className="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface-subtle)] px-3 py-2">{children}</div></div>; }
function Choice({ label, checked, onCheckedChange }: { label: string; checked: boolean; onCheckedChange: (checked: boolean) => void }) { return <label className="inline-flex items-center gap-2 text-[10px]"><Checkbox checked={checked} onCheckedChange={(value) => onCheckedChange(value === true)} />{label}</label>; }
function ContractTable({ title, description, addLabel, onAdd, headers, empty, children }: { title: string; description: string; addLabel: string; onAdd: () => void; headers: string[]; empty: string; children: React.ReactNode }) { const hasRows = Array.isArray(children) ? children.length > 0 : Boolean(children); return <div><div className="mb-2 flex items-end justify-between gap-3"><div><strong className="text-[11px]">{title}</strong><p className="mt-0.5 text-[9px] text-[var(--muted)]">{description}</p></div><Button type="button" onClick={onAdd} variant="secondary" size="sm"><Plus />{addLabel}</Button></div><div className="overflow-x-auto rounded-[8px] border border-[var(--line)]"><table className="w-full min-w-[720px] text-left text-[9px]"><thead className="bg-[var(--surface-subtle)] text-[var(--muted)]"><tr>{headers.map((header, index) => <th key={`${header}-${index}`} className="px-3 py-2 font-medium">{header}</th>)}</tr></thead><tbody>{children}{!hasRows && <tr><td colSpan={headers.length} className="p-8 text-center text-[var(--muted)]">{empty}</td></tr>}</tbody></table></div></div>; }
function CompactSelect({ value, options, change }: { value: string; options: readonly string[]; change: (value: string) => void }) { return <Select value={value} onValueChange={change}><SelectTrigger className="min-w-24"><SelectValue /></SelectTrigger><SelectContent>{options.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select>; }
function IconDelete({ label, click }: { label: string; click: () => void }) { return <Button type="button" onClick={click} variant="ghost" size="icon-sm" className="text-[var(--danger)]" aria-label={label}><Trash2 /></Button>; }

function AdvancedFields() {
  return <div className="grid gap-4 border-t border-[var(--line)] p-4 sm:grid-cols-2 lg:grid-cols-4">
    <Field label="接口说明" optional><textarea name="description" rows={3} className={`${textareaClass} lg:min-h-24`} /></Field>
    <Field label="标签" optional><input name="tags" className={inputClass} placeholder="图片,随机,素材" /></Field>
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

type ContentDeleteTarget = { mode: "items"; items: AssetView[] } | { mode: "all" };

function ContentManager({ api, close, changed }: { api: CatalogProduct; close: () => void; changed: (count: number) => void }) {
  const [assets, setAssets] = useState<AssetView[] | null>(null);
  const [total, setTotal] = useState(api.assetCount);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [mediaInputKey, setMediaInputKey] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [deleteTarget, setDeleteTarget] = useState<ContentDeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [entryFile, setEntryFile] = useState("");
  const handler = api.internalHandler;
  const selectable = handler !== phpHandlerId;
  const visibleAssets = assets ?? [];
  const allDisplayedSelected = selectable && visibleAssets.length > 0 && visibleAssets.every((asset) => selectedIds.has(asset.id));

  async function refresh() {
    const response = await fetch(`/api/v1/admin/apis/assets?productId=${encodeURIComponent(api.id)}`, { cache: "no-store" });
    const source = await response.text();
    let result: { message?: string; data?: AssetView[]; meta?: { total?: number; entryFile?: string } } | null = null;
    try { result = source ? JSON.parse(source) : null; } catch { result = null; }
    if (!response.ok || !result?.data) throw new Error(result?.message || `无法加载 API 内容（HTTP ${response.status}）`);
    const nextTotal = Number(result.meta?.total ?? result.data.length);
    setAssets(result.data);
    setTotal(nextTotal);
    setEntryFile(String(result.meta?.entryFile ?? ""));
    setSelectedIds(new Set());
    changed(nextTotal);
  }

  useEffect(() => {
    let active = true;
    void fetch(`/api/v1/admin/apis/assets?productId=${encodeURIComponent(api.id)}`, { cache: "no-store" })
      .then(async (response) => ({ response, result: await response.json().catch(() => null) }))
      .then(({ response, result }) => {
        if (!active) return;
        if (response.ok && Array.isArray(result?.data)) {
          setAssets(result.data);
          setTotal(Number(result.meta?.total ?? result.data.length));
          setEntryFile(String(result.meta?.entryFile ?? ""));
        } else setError(result?.message || `无法加载 API 内容（HTTP ${response.status}）`);
      })
      .catch(() => { if (active) setError("无法加载 API 内容"); });
    return () => { active = false; };
  }, [api.id]);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const form = new FormData(formElement);
      const media = ["content.random-image", "content.random-video"].includes(handler ?? "");
      if (media) {
        const files = form.getAll("assets").filter((item): item is File => item instanceof File && item.size > 0);
        const summary = await uploadMediaFiles(api.id, files, (current, count, name) => setMessage(`正在处理 ${current} / ${count}：${name}`));
        if (summary.uploaded || summary.duplicates || summary.skipped.length) setMessage(mediaUploadMessage(summary));
        if (summary.skipped.length) setError(summary.skipped.slice(0, 5).join("；") + (summary.skipped.length > 5 ? `；另有 ${summary.skipped.length - 5} 个文件未导入` : ""));
        if (summary.uploaded || summary.duplicates) {
          setMediaInputKey((value) => value + 1);
          if (summary.uploaded) await refresh();
        }
        return;
      }
      form.append("productId", api.id);
      const response = await fetch("/api/v1/admin/apis/assets", { method: "POST", body: form });
      const result = await responsePayload(response);
      if (!response.ok) { setError(result.message || "内容上传失败"); return; }
      setMessage(result.message || "内容已更新");
      if (result.data?.entryFile) setEntryFile(String(result.data.entryFile));
      formElement.reset();
      setMediaInputKey((value) => value + 1);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法连接内容管理服务");
    } finally {
      setSaving(false);
    }
  }

  function requestDelete(target: ContentDeleteTarget) {
    setDeleteError("");
    setDeleteTarget(target);
  }

  async function remove() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const all = deleteTarget.mode === "all";
      const selected = all ? [] : deleteTarget.items;
      const response = await fetch(all
        ? `/api/v1/admin/apis/assets?productId=${encodeURIComponent(api.id)}&all=true`
        : `/api/v1/admin/apis/assets?productId=${encodeURIComponent(api.id)}`, {
        method: "DELETE",
        headers: all ? undefined : { "Content-Type": "application/json" },
        body: all ? undefined : JSON.stringify({ ids: selected.map((asset) => asset.id) }),
      });
      const result = await responsePayload(response);
      if (!response.ok) { setDeleteError(result.message || "删除失败"); return; }
      const deleted = Number(result.data?.deleted ?? (all ? total : selected.length));
      const removedIds = new Set(selected.map((asset) => asset.id));
      setAssets((items) => all ? [] : items?.filter((item) => !removedIds.has(item.id)) ?? []);
      setTotal((value) => {
        const next = all ? 0 : Math.max(0, value - deleted);
        changed(next);
        return next;
      });
      setSelectedIds(new Set());
      setMessage(result.message || `已删除 ${deleted} 项内容`);
      setDeleteTarget(null);
    } catch {
      setDeleteError("无法连接内容管理服务，请稍后重试");
    } finally {
      setDeleting(false);
    }
  }

  const selectedAssets = visibleAssets.filter((asset) => selectedIds.has(asset.id));
  const deleteTitle = deleteTarget?.mode === "all" ? "清空全部返回内容？" : deleteTarget?.items.length === 1 ? "删除返回内容？" : `删除已选的 ${deleteTarget?.items.length ?? 0} 项内容？`;
  const deleteDescription = deleteTarget?.mode === "all" ? `${api.name} · 当前 ${total} 项` : deleteTarget?.items.length === 1 ? deleteTarget.items[0].preview || deleteTarget.items[0].name : "已选择的内容将从返回池中移除";

  return <div className="fixed inset-0 z-50 overflow-y-auto bg-black/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving && !deleting) close(); }}>
    <div className="mx-auto my-6 w-full max-w-3xl overflow-hidden rounded-[8px] border border-[var(--line)] bg-[var(--surface)] shadow-2xl">
      <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4"><div><h3 className="text-[14px] font-bold">{handler === phpHandlerId ? "管理 PHP 程序包" : "管理返回内容"}</h3><p className="mt-1 text-[9px] text-[var(--muted)]">{api.name} · 当前 {total} 项</p></div><button type="button" onClick={close} disabled={saving || deleting} className="grid size-10 place-items-center rounded-[7px] hover:bg-[var(--surface-subtle)] disabled:opacity-50 lg:size-8" aria-label="关闭"><X className="size-4" /></button></div>
      <form onSubmit={add} className="space-y-4 border-b border-[var(--line)] p-5">
        {handler === "content.random-image" && <FileUploadField key={`image-${mediaInputKey}`} name="assets" required accept="*/*" multiple title="继续添加图片或 ZIP" description="支持单张、多选或 ZIP；管理员文件直接保存，重复内容自动跳过" icon={<FileImage />} />}
        {handler === "content.random-video" && <FileUploadField key={`video-${mediaInputKey}`} name="assets" required accept="*/*" multiple title="继续添加视频或 ZIP" description="支持单个、多选或 ZIP；管理员文件直接保存，重复内容自动跳过并支持 Range 播放" icon={<FileVideo />} />}
        {handler === "content.random-text" && <><Field label="继续添加文本"><textarea name="content" rows={4} className={textareaClass} placeholder="每行一条" /></Field><FileUploadField key={`text-${mediaInputKey}`} name="assets" accept=".txt,text/plain" multiple title="上传 TXT 文件（可选）" description="支持一个或多个纯文本文件；每个非空行会加入随机内容池" icon={<Type />} /></>}
        {handler === "content.static-json" && <><Field label="替换 JSON 响应"><textarea name="content" rows={7} className={`${textareaClass} mono`} placeholder={'{"message":"updated"}'} /></Field><FileUploadField key={`json-${mediaInputKey}`} name="assets" accept=".json,application/json" title="上传 JSON 文件（可选）" description="文件通过 JSON 语法校验后会替换当前响应内容" icon={<Braces />} /></>}
        {handler === "content.dataset" && <><FileUploadField key={`dataset-${mediaInputKey}`} name="assets" required accept="*/*" multiple title="替换通用数据源" description="支持单独文件或 ZIP 数据包；未知扩展名按内容识别，全部校验通过后原子替换" icon={<Database />} /><p className="text-[9px] leading-4 text-[var(--muted)]">文件分组、记录集合路径、文本字段和筛选参数可在 API 配置中心调整。</p></>}
        {handler === phpHandlerId && <><FileUploadField key={`php-${mediaInputKey}`} name="assets" required accept=".zip,.php,application/zip,application/x-zip-compressed,application/x-httpd-php,text/x-php,text/plain" title="替换 PHP 程序包或单个 PHP 文件" description="支持 ZIP，也支持直接上传 index.php；新文件校验通过后原子替换" icon={<FileCode2 />} /><Field label="入口文件" optional><input name="entryFile" value={entryFile} onChange={(event) => setEntryFile(event.target.value)} className={inputClass} placeholder="留空自动发现" /></Field><p className="text-[9px] leading-4 text-[var(--muted)]">当前入口会自动回填；ZIP 目录变化时可留空重新发现入口。</p></>}
        {message && <p role="status" className="animate-[ui-fade-in_160ms_ease-out] rounded-[8px] bg-[var(--aqua-soft)] px-3 py-2 text-[10px] text-[var(--aqua)]">{message}</p>}
        {error && <p role="alert" className="animate-[ui-shake_220ms_ease-out] rounded-[8px] bg-[var(--danger-soft)] px-3 py-2 text-[10px] text-[var(--danger)]">{error}</p>}
        <button disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-[var(--brand)] px-4 text-[10px] font-semibold text-white disabled:opacity-60 lg:h-9">{saving ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}{handler === phpHandlerId ? "部署新程序包" : handler === "content.static-json" ? "更新 JSON" : handler === "content.dataset" ? "替换数据源" : saving && ["content.random-image", "content.random-video"].includes(handler ?? "") ? "正在处理" : "添加内容"}</button>
      </form>
      {selectable && assets && total > 0 && <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] bg-[var(--surface-subtle)] px-5 py-2.5">
        <label className="flex min-h-8 items-center gap-2 text-[10px] font-medium"><Checkbox checked={allDisplayedSelected ? true : selectedIds.size ? "indeterminate" : false} onCheckedChange={(checked) => setSelectedIds(checked ? new Set(visibleAssets.map((asset) => asset.id)) : new Set())} />选择当前显示</label>
        <span className="text-[9px] text-[var(--muted)]">已选 {selectedIds.size} 项</span>
        <div className="ml-auto flex gap-2"><Button type="button" variant="secondary" size="sm" disabled={!selectedAssets.length} onClick={() => requestDelete({ mode: "items", items: selectedAssets })}><Trash2 />删除已选</Button><Button type="button" variant="destructive" size="sm" onClick={() => requestDelete({ mode: "all" })}><Trash2 />清空全部</Button></div>
      </div>}
      {total > visibleAssets.length && <div className="border-b border-[var(--line)] px-5 py-2 text-[9px] text-[var(--muted)]">当前显示最近 {visibleAssets.length} 项，共 {total} 项</div>}
      <div className="max-h-80 divide-y divide-[var(--line)] overflow-y-auto">
        {visibleAssets.map((asset) => <div key={asset.id} className="animate-[ui-fade-in_160ms_ease-out] flex items-center gap-3 px-5 py-3">{selectable && <Checkbox checked={selectedIds.has(asset.id)} onCheckedChange={(checked) => setSelectedIds((current) => { const next = new Set(current); if (checked) next.add(asset.id); else next.delete(asset.id); return next; })} aria-label={`选择 ${asset.name}`} />}<span className="grid size-8 shrink-0 place-items-center rounded-[8px] bg-[var(--surface-subtle)]">{asset.kind === "IMAGE" ? <FileImage className="size-4" /> : asset.kind === "VIDEO" ? <FileVideo className="size-4" /> : asset.kind === "JSON" ? <Braces className="size-4" /> : asset.kind === "DATASET" ? <Database className="size-4" /> : asset.kind === "PHP_SOURCE" ? <FileCode2 className="size-4" /> : <Type className="size-4" />}</span><div className="min-w-0 flex-1"><strong className="block truncate text-[10px]">{asset.preview || asset.name}</strong><span className="mt-0.5 block text-[8px] text-[var(--muted)]">{formatBytes(asset.size)} · {new Date(asset.createdAt).toLocaleString("zh-CN")}</span></div>{selectable && <button type="button" onClick={() => requestDelete({ mode: "items", items: [asset] })} className="grid size-10 place-items-center rounded-[7px] text-[var(--muted)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)] lg:size-8" aria-label={`删除 ${asset.name}`}><Trash2 className="size-3.5" /></button>}</div>)}
        {assets?.length === 0 && <div className="py-12 text-center text-[10px] text-[var(--muted)]">当前没有可返回的内容</div>}
        {assets === null && !error && <div className="grid place-items-center py-12"><Loader2 className="size-5 animate-spin text-[var(--brand)]" /></div>}
      </div>
    </div>
    {deleteTarget && <ConfirmDialog open title={deleteTitle} description={deleteDescription} detail={deleteTarget.mode === "all" ? "清空后此 API 将暂时没有可返回内容，操作不可撤销。" : "删除后所选内容不会再被接口返回，操作不可撤销。"} confirmLabel={deleteTarget.mode === "all" ? "确认清空" : "确认删除"} busy={deleting} error={deleteError} onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setDeleteError(""); } }} onConfirm={remove} />}
  </div>;
}

function AssetPicker({ name, accept, multiple = false, required = false, title, description, icon }: { name: string; accept: string; multiple?: boolean; required?: boolean; title: string; description: string; icon: React.ReactNode }) {
  return <FileUploadField name={name} required={required} accept={accept} multiple={multiple} title={title} description={description} icon={icon} />;
}

function executionLabel(api: CatalogProduct) { if (api.internalHandler === "content.random-image") return "随机图片"; if (api.internalHandler === "content.random-video") return "随机视频"; if (api.internalHandler === "content.random-text") return "随机文本"; if (api.internalHandler === "content.static-json") return "固定 JSON"; if (api.internalHandler === "content.dataset") return "通用数据源"; if (api.internalHandler === phpHandlerId) return "PHP 程序包"; if (api.upstreamType === "PUBLIC_API") return "公网 API"; if (api.upstreamType === "SERVER_LOCAL") return "服务器内网"; if (api.upstreamType === "TUNNEL") return "临时穿透"; return "内置工具"; }
function formatBytes(value: number) { if (value < 1024) return `${value} B`; if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`; if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`; return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`; }
function Section({ title, children }: { title: string; children: React.ReactNode }) { return <section><h4 className="mb-3 text-[11px] font-bold">{title}</h4>{children}</section>; }
function Field({ label, optional = false, children }: { label: string; optional?: boolean; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold">{label}{optional && <em className="not-italic font-normal text-[var(--muted)]">可选</em>}</span>{children}</label>; }
