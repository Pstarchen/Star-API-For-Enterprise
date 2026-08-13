"use client";

import { Activity, CheckCircle2, CircleDollarSign, Loader2, Pencil, Plus, RotateCw, ServerCog, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { epayPaymentTypeNames, epayPaymentTypes, type EpayPaymentType } from "@/lib/payment-options";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { ConfirmDialog } from "./ui/confirm-dialog";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input, Textarea } from "./ui/input";
import { Switch } from "./ui/switch";

export type PaymentProviderView = {
  id: string;
  name: string;
  gatewayUrl: string;
  merchantPid: string;
  merchantKeyConfigured: boolean;
  paymentTypes: string[];
  feeRate: string;
  minAmount: string;
  maxAmount: string;
  sortOrder: number;
  enabled: boolean;
  description: string | null;
  healthStatus: "UNKNOWN" | "HEALTHY" | "UNHEALTHY";
  lastTestedAt: string | null;
  lastTestMessage: string | null;
  orderCount: number;
  createdAt: string;
  updatedAt: string;
};

export function PaymentProvidersManager({ initialProviders }: { initialProviders: PaymentProviderView[] }) {
  const [providers, setProviders] = useState(initialProviders);
  const [editing, setEditing] = useState<PaymentProviderView | "NEW" | null>(null);
  const [removing, setRemoving] = useState<PaymentProviderView | null>(null);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setSaving(true); setError(""); setMessage("");
    const form = new FormData(event.currentTarget);
    const paymentTypes = epayPaymentTypes.filter((type) => form.get(`paymentType-${type}`) === "on");
    const payload = {
      ...(editing === "NEW" ? {} : { id: editing.id }),
      name: form.get("name"),
      gatewayUrl: form.get("gatewayUrl"),
      merchantPid: form.get("merchantPid"),
      ...(String(form.get("merchantKey") ?? "").trim() ? { merchantKey: form.get("merchantKey") } : {}),
      paymentTypes,
      feeRate: form.get("feeRate"),
      minAmount: form.get("minAmount"),
      maxAmount: form.get("maxAmount"),
      sortOrder: Number(form.get("sortOrder")),
      enabled: form.get("enabled") === "on",
      description: form.get("description") || undefined,
    };
    try {
      const response = await fetch("/api/v1/admin/payment-providers", { method: editing === "NEW" ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setError(body.message ?? "支付服务商保存失败"); return; }
      const provider = body.data as PaymentProviderView;
      setProviders((items) => editing === "NEW" ? [...items, provider].sort(providerSort) : items.map((item) => item.id === provider.id ? provider : item).sort(providerSort));
      setEditing(null); setMessage(body.message);
    } catch {
      setError("无法连接支付服务，请检查网络后重试");
    } finally {
      setSaving(false);
    }
  }

  async function test(provider: PaymentProviderView) {
    setTestingId(provider.id); setError(""); setMessage("");
    try {
      const response = await fetch("/api/v1/admin/payment-providers/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: provider.id }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setProviders((items) => items.map((item) => item.id === provider.id ? { ...item, healthStatus: "UNHEALTHY", lastTestedAt: new Date().toISOString(), lastTestMessage: body.message ?? "连接测试失败" } : item));
        setError(body.message ?? "支付网关连接测试失败"); return;
      }
      setProviders((items) => items.map((item) => item.id === provider.id ? body.data as PaymentProviderView : item));
      setMessage(body.message);
    } catch {
      setError("无法连接支付服务，请检查网络后重试");
    } finally {
      setTestingId("");
    }
  }

  async function remove() {
    if (!removing) return;
    setDeleting(true); setError("");
    try {
      const response = await fetch("/api/v1/admin/payment-providers", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: removing.id }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setError(body.message ?? "支付服务商删除失败"); return; }
      setProviders((items) => items.filter((item) => item.id !== removing.id));
      setRemoving(null); setMessage(body.message);
    } catch {
      setError("无法连接支付服务，请检查网络后重试");
    } finally {
      setDeleting(false);
    }
  }

  const enabledCount = providers.filter((provider) => provider.enabled).length;
  const healthyCount = providers.filter((provider) => provider.healthStatus === "HEALTHY").length;

  return <div className="space-y-5">
    <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="eyebrow">EPAY PROVIDERS</p><h2 className="mt-1 text-xl font-bold">易支付服务商</h2><p className="mt-1 text-[11px] text-[var(--muted)]">管理签名网关、商户凭据、支付方式和金额范围；密钥只加密保存，不会回传浏览器。</p></div><Button size="sm" onClick={() => { setEditing("NEW"); setError(""); }}><Plus />新增服务商</Button></header>
    <div className="grid gap-3 sm:grid-cols-3"><Summary icon={ServerCog} label="已配置服务商" value={providers.length} /><Summary icon={CircleDollarSign} label="已启用" value={enabledCount} /><Summary icon={Activity} label="最近检测可用" value={healthyCount} /></div>
    {message && <p role="status" className="flex items-center gap-2 rounded-[var(--radius-control)] bg-[var(--success-soft)] px-4 py-3 text-[10px] text-[var(--success)]"><CheckCircle2 className="size-4" />{message}</p>}
    {error && !editing && !removing && <p role="alert" className="rounded-[var(--radius-control)] bg-[var(--danger-soft)] px-4 py-3 text-[10px] text-[var(--danger)]">{error}</p>}
    <section className="panel overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[920px] text-left text-[10px]"><thead className="bg-[var(--surface-subtle)] text-[var(--muted)]"><tr><th className="px-4 py-3">服务商</th><th className="px-4 py-3">支付方式</th><th className="px-4 py-3">金额 / 费率</th><th className="px-4 py-3">连接状态</th><th className="px-4 py-3">历史订单</th><th className="px-4 py-3">启用</th><th className="px-4 py-3 text-right">操作</th></tr></thead><tbody className="divide-y divide-[var(--line)]">{providers.map((provider) => <tr key={provider.id} className="hover:bg-[var(--surface-subtle)]"><td className="px-4 py-4"><strong className="block text-[11px]">{provider.name}</strong><span className="mt-1 block text-[9px] text-[var(--muted)]">PID {provider.merchantPid} · 排序 {provider.sortOrder}</span></td><td className="px-4 py-4"><div className="flex flex-wrap gap-1">{provider.paymentTypes.map((type) => <Badge key={type} variant="neutral">{epayPaymentTypeNames[type as EpayPaymentType] ?? type}</Badge>)}</div></td><td className="px-4 py-4"><strong>¥{provider.minAmount} - ¥{provider.maxAmount}</strong><span className="mt-1 block text-[9px] text-[var(--muted)]">服务费率 {provider.feeRate}%</span></td><td className="px-4 py-4"><Health provider={provider} /></td><td className="px-4 py-4">{provider.orderCount.toLocaleString("zh-CN")}</td><td className="px-4 py-4"><Badge variant={provider.enabled ? "success" : "neutral"}>{provider.enabled ? "已启用" : "已停用"}</Badge></td><td className="px-4 py-4"><div className="flex justify-end gap-1"><Button type="button" variant="ghost" size="icon-sm" disabled={testingId === provider.id} onClick={() => test(provider)} aria-label={`测试 ${provider.name}`}>{testingId === provider.id ? <Loader2 className="animate-spin" /> : <RotateCw />}</Button><Button type="button" variant="ghost" size="icon-sm" onClick={() => { setEditing(provider); setError(""); }} aria-label={`编辑 ${provider.name}`}><Pencil /></Button><Button type="button" variant="ghost" size="icon-sm" className="text-[var(--danger)]" onClick={() => { setRemoving(provider); setError(""); }} aria-label={`删除 ${provider.name}`}><Trash2 /></Button></div></td></tr>)}</tbody></table></div>{!providers.length && <div className="grid min-h-52 place-items-center px-6 text-center"><div><ServerCog className="mx-auto size-7 text-[var(--muted)]" /><strong className="mt-3 block text-[12px]">尚未配置易支付服务商</strong><p className="mt-1 text-[10px] text-[var(--muted)]">新增并启用服务商后，用户充值与账单支付将出现易支付选项。</p></div></div>}</section>
    <ProviderDialog provider={editing} saving={saving} error={editing ? error : ""} onOpenChange={(open) => { if (!open && !saving) { setEditing(null); setError(""); } }} onSubmit={save} />
    <ConfirmDialog open={Boolean(removing)} title={`删除 ${removing?.name ?? "支付服务商"}？`} description="没有历史订单时才允许删除；已有订单的服务商应停用并保留审计信息。" detail={removing?.orderCount ? `该服务商已有 ${removing.orderCount} 笔历史订单，系统会拒绝删除。` : "删除后其商户密钥和网关配置将无法恢复。"} busy={deleting} error={removing ? error : ""} onOpenChange={(open) => { if (!open) { setRemoving(null); setError(""); } }} onConfirm={remove} />
  </div>;
}

function ProviderDialog({ provider, saving, error, onOpenChange, onSubmit }: { provider: PaymentProviderView | "NEW" | null; saving: boolean; error: string; onOpenChange: (open: boolean) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  if (!provider) return null;
  const value = provider === "NEW" ? null : provider;
  return <Dialog open onOpenChange={onOpenChange}><DialogContent className="max-w-[760px] p-0" showClose={!saving}><form onSubmit={onSubmit}><DialogHeader><DialogTitle>{value ? `编辑 ${value.name}` : "新增易支付服务商"}</DialogTitle><DialogDescription>网关可填写站点根地址或 submit.php 地址。首次创建必须填写商户密钥，编辑时留空会保留现有密钥。</DialogDescription></DialogHeader><DialogBody className="grid gap-4 sm:grid-cols-2"><Field label="显示名称"><Input name="name" required maxLength={80} defaultValue={value?.name ?? ""} placeholder="例如：主易支付节点" /></Field><Field label="商户 PID"><Input name="merchantPid" required maxLength={100} defaultValue={value?.merchantPid ?? ""} autoComplete="off" /></Field><Field label="网关地址" className="sm:col-span-2"><Input name="gatewayUrl" required type="url" maxLength={500} defaultValue={value?.gatewayUrl ?? ""} placeholder="https://pay.example.com/" /></Field><Field label="商户密钥" hint={value?.merchantKeyConfigured ? "密钥已配置，留空以保留当前值。" : "仅加密保存，不会再次显示。"} className="sm:col-span-2"><Input name="merchantKey" required={!value?.merchantKeyConfigured} maxLength={500} type="password" autoComplete="new-password" placeholder={value?.merchantKeyConfigured ? "留空保留当前密钥" : "请输入商户密钥"} /></Field><fieldset className="sm:col-span-2"><legend className="mb-2 text-[10px] font-semibold">开放支付方式</legend><div className="grid gap-2 sm:grid-cols-3">{epayPaymentTypes.map((type) => <label key={type} className="flex h-10 items-center gap-2 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-[11px]"><Checkbox name={`paymentType-${type}`} defaultChecked={value ? value.paymentTypes.includes(type) : type !== "qqpay"} />{epayPaymentTypeNames[type]}</label>)}</div></fieldset><Field label="服务费率（%）"><Input name="feeRate" required type="number" min="0" max="100" step="0.0001" defaultValue={value?.feeRate ?? "0"} /></Field><Field label="排序"><Input name="sortOrder" required type="number" min="-10000" max="10000" step="1" defaultValue={value?.sortOrder ?? 0} /></Field><Field label="最低金额"><Input name="minAmount" required type="number" min="0.01" max="100000000" step="0.01" defaultValue={value?.minAmount ?? "1.00"} /></Field><Field label="最高金额"><Input name="maxAmount" required type="number" min="0.01" max="100000000" step="0.01" defaultValue={value?.maxAmount ?? "10000.00"} /></Field><Field label="说明" className="sm:col-span-2"><Textarea name="description" maxLength={500} rows={3} defaultValue={value?.description ?? ""} placeholder="仅管理员可见的节点用途或结算备注" /></Field><label className="flex items-center justify-between gap-4 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface-subtle)] p-3 sm:col-span-2"><span><strong className="block text-[11px]">允许用户选择该服务商</strong><small className="mt-1 block text-[9px] text-[var(--muted)]">保存后立即影响新订单；已有订单回调仍可完成。</small></span><Switch name="enabled" defaultChecked={value?.enabled ?? false} value="on" /></label>{error && <p role="alert" className="rounded-[var(--radius-control)] bg-[var(--danger-soft)] px-3 py-2 text-[10px] text-[var(--danger)] sm:col-span-2">{error}</p>}</DialogBody><DialogFooter><Button type="button" variant="secondary" disabled={saving} onClick={() => onOpenChange(false)}>取消</Button><Button disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <CircleDollarSign />}{saving ? "正在保存" : "保存服务商"}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function Field({ label, hint, className, children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) { return <label className={className}><span className="mb-1.5 block text-[10px] font-semibold">{label}</span>{children}{hint && <small className="mt-1.5 block text-[9px] text-[var(--muted)]">{hint}</small>}</label>; }
function Summary({ icon: Icon, label, value }: { icon: typeof ServerCog; label: string; value: number }) { return <section className="panel flex items-center gap-3 p-4"><span className="grid size-9 place-items-center rounded-[var(--radius-control)] bg-[var(--brand-soft)] text-[var(--brand)]"><Icon className="size-4" /></span><span><small className="block text-[9px] text-[var(--muted)]">{label}</small><strong className="mt-1 block text-lg">{value}</strong></span></section>; }
function Health({ provider }: { provider: PaymentProviderView }) { const variant = provider.healthStatus === "HEALTHY" ? "success" : provider.healthStatus === "UNHEALTHY" ? "danger" : "neutral"; const label = provider.healthStatus === "HEALTHY" ? "可用" : provider.healthStatus === "UNHEALTHY" ? "异常" : "未检测"; return <div><Badge variant={variant}>{label}</Badge><span className="mt-1 block max-w-56 truncate text-[9px] text-[var(--muted)]" title={provider.lastTestMessage ?? undefined}>{provider.lastTestMessage ?? "尚未执行连接测试"}</span></div>; }
function providerSort(left: PaymentProviderView, right: PaymentProviderView) { return left.sortOrder - right.sortOrder || left.createdAt.localeCompare(right.createdAt); }
