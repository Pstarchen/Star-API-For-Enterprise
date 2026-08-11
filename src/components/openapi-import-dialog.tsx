"use client";

import { FileJson2, Loader2, Upload } from "lucide-react";
import { type FormEvent, useState } from "react";
import type { CatalogProduct } from "@/lib/catalog";
import { Button } from "./ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { FormField, FormLabel, FormMessage } from "./ui/form-field";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

export function OpenApiImportDialog({ defaultPublicHost, close, imported }: { defaultPublicHost: string; close: () => void; imported: (api: CatalogProduct, message: string) => void }) {
  const [billingMode, setBillingMode] = useState<"FREE" | "PER_REQUEST">("FREE");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    const payload = new FormData();
    payload.append("document", form.get("document") as File);
    payload.append("config", JSON.stringify({ name: String(form.get("name") ?? ""), slug: String(form.get("slug") ?? ""), publicHost: String(form.get("publicHost") ?? ""), publicPrefix: String(form.get("publicPrefix") ?? "/api"), upstreamOverride: String(form.get("upstreamOverride") ?? ""), visibility: String(form.get("visibility") ?? "PUBLIC"), billingMode, unitPrice: billingMode === "FREE" ? 0 : String(form.get("unitPrice") ?? "0"), defaultQpsLimit: String(form.get("defaultQpsLimit") ?? "10") }));
    const response = await fetch("/api/v1/admin/apis/import", { method: "POST", body: payload });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) { setError(result.message || "OpenAPI 导入失败"); return; }
    imported(result.data, result.message);
  }

  return <Dialog open onOpenChange={(open) => { if (!open) close(); }}><DialogContent className="w-[min(calc(100%-24px),768px)] p-0" showClose={false}><form onSubmit={submit}><DialogHeader><DialogTitle>导入 OpenAPI</DialogTitle><DialogDescription>从 OpenAPI 3.x JSON/YAML 自动生成路由、参数和响应 Schema。</DialogDescription></DialogHeader><DialogBody className="space-y-5"><label className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-[8px] border border-dashed border-[var(--line-strong)] bg-[var(--surface-subtle)] p-5 text-center transition hover:border-[var(--brand)] hover:bg-[var(--brand-soft)]"><FileJson2 className="size-6 text-[var(--brand)]" /><strong className="mt-3 text-[11px]">选择 OpenAPI 文档</strong><span className="mt-1 text-[9px] text-[var(--muted)]">支持 JSON、YAML、YML，最大 2 MB，单次最多 100 个端点</span><input name="document" required type="file" accept=".json,.yaml,.yml,application/json,application/yaml,text/yaml" className="mt-3 max-w-full text-[9px]" /></label><div className="grid gap-4 sm:grid-cols-2"><Field label="API 名称"><Input name="name" required placeholder="例如：企业数据服务" /></Field><Field label="唯一标识"><Input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="enterprise-data" /></Field><Field label="API 域名"><Input name="publicHost" required defaultValue={defaultPublicHost} /></Field><Field label="公开路径前缀"><Input name="publicPrefix" required defaultValue="/api" placeholder="/api/enterprise" /></Field><Field label="覆盖上游地址" optional><Input name="upstreamOverride" type="url" placeholder="留空使用 servers[0].url" /></Field><Field label="可见范围"><Select name="visibility" defaultValue="PUBLIC"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="PUBLIC">公开市场</SelectItem><SelectItem value="PRIVATE">指定企业</SelectItem><SelectItem value="GRAY">灰度测试</SelectItem><SelectItem value="INTERNAL">内部网关</SelectItem></SelectContent></Select></Field><Field label="默认 QPS"><Input name="defaultQpsLimit" type="number" min="1" defaultValue="10" /></Field><Field label="计费方式"><Select value={billingMode} onValueChange={(value) => setBillingMode(value as "FREE" | "PER_REQUEST")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="FREE">免费</SelectItem><SelectItem value="PER_REQUEST">按成功请求</SelectItem></SelectContent></Select></Field>{billingMode === "PER_REQUEST" && <Field label="单价（元/次）"><Input name="unitPrice" required type="number" min="0.000001" step="0.000001" /></Field>}</div>{error && <FormMessage>{error}</FormMessage>}</DialogBody><DialogFooter><Button type="button" onClick={close} variant="secondary" size="sm">取消</Button><Button disabled={saving} size="sm">{saving ? <Loader2 className="animate-spin" /> : <Upload />}{saving ? "正在导入" : "导入为草稿"}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function Field({ label, optional = false, children }: { label: string; optional?: boolean; children: React.ReactNode }) { return <FormField><FormLabel className="flex gap-1">{label}{optional && <em className="not-italic font-normal text-[var(--muted)]">可选</em>}</FormLabel>{children}</FormField>; }
