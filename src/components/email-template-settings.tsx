"use client";

import { BellRing, Check, Copy, Eye, Gauge, Loader2, RefreshCw, RotateCcw, Save } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { emailEventDefinitions, emailEventIds, type EmailEventId, type EmailSettings } from "@/lib/email-templates";
import { Button } from "./ui/button";
import { FormField, FormLabel, FormMessage } from "./ui/form-field";
import { Input, InputGroup, Textarea } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Switch } from "./ui/switch";

type Preview = { subject: string; html: string };

export function EmailTemplateSettings({ initial }: { initial: EmailSettings }) {
  const [settings, setSettings] = useState(initial);
  const [eventId, setEventId] = useState<EmailEventId>("email-verification");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const previewRequest = useRef(0);
  const template = settings.templates[eventId];
  const definition = emailEventDefinitions[eventId];

  const refreshPreview = useCallback(async (targetEvent: EmailEventId, next: { subject: string; html: string }) => {
    const requestId = ++previewRequest.current;
    setPreviewing(true); setError("");
    try {
      const response = await fetch("/api/v1/admin/email-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "preview", eventId: targetEvent, ...next }) });
      const result = await response.json();
      if (requestId !== previewRequest.current) return;
      if (!response.ok) { setError(result.message ?? "无法生成邮件预览"); return; }
      setPreview(result.data);
    } catch {
      if (requestId === previewRequest.current) setError("无法连接邮件预览服务");
    } finally {
      if (requestId === previewRequest.current) setPreviewing(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refreshPreview(eventId, template); }, 450);
    return () => window.clearTimeout(timer);
  }, [eventId, refreshPreview, template]);

  function updateTemplate(key: "subject" | "html", value: string) {
    setSettings((current) => ({ ...current, templates: { ...current.templates, [eventId]: { ...current.templates[eventId], [key]: value } } }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setMessage(""); setError("");
    try {
      const response = await fetch("/api/v1/admin/email-settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) });
      const result = await response.json();
      if (!response.ok) { setError(result.message ?? "邮件设置保存失败"); return; }
      setSettings(result.data); setMessage(result.message); await refreshPreview(eventId, result.data.templates[eventId]);
    } catch {
      setError("无法连接邮件设置服务");
    } finally {
      setSaving(false);
    }
  }

  async function restoreOfficial() {
    setMessage(""); setError("");
    try {
      const response = await fetch("/api/v1/admin/email-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "official", eventId }) });
      const result = await response.json();
      if (!response.ok) { setError(result.message ?? "无法读取官方模板"); return; }
      setSettings((current) => ({ ...current, templates: { ...current.templates, [eventId]: result.data } }));
      setMessage(`已恢复“${definition.label}”官方模板，保存后生效`); await refreshPreview(eventId, result.data);
    } catch {
      setError("无法连接邮件设置服务");
    }
  }

  async function copyPlaceholder(name: string) {
    try {
      await navigator.clipboard.writeText(`{{${name}}}`); setCopied(name);
      window.setTimeout(() => setCopied((current) => current === name ? "" : current), 1200);
    } catch { setError("浏览器未授权写入剪贴板"); }
  }

  return <form onSubmit={save} className="page-shell max-w-5xl space-y-5">
    <section className="panel overflow-hidden">
      <header className="flex flex-col justify-between gap-3 border-b border-[var(--line)] px-5 py-4 xl:flex-row xl:items-end">
        <div><p className="eyebrow">MAIL TEMPLATES</p><h3 className="mt-1 text-[14px] font-bold">邮件模板</h3><p className="mt-1 text-[10px] text-[var(--muted)]">按事件自定义事务邮件，实际发送与预览共用后端渲染器。</p></div>
        <div className="grid gap-2 sm:grid-cols-[220px_auto_auto]"><Select value={eventId} onValueChange={(value) => setEventId(value as EmailEventId)}><SelectTrigger aria-label="邮件事件"><SelectValue /></SelectTrigger><SelectContent>{emailEventIds.map((id) => <SelectItem key={id} value={id}>{emailEventDefinitions[id].label}</SelectItem>)}</SelectContent></Select><Button type="button" variant="secondary" size="sm" onClick={() => refreshPreview(eventId, template)} disabled={previewing}>{previewing ? <Loader2 className="animate-spin" /> : <RefreshCw />}预览 / 刷新</Button><Button type="button" variant="secondary" size="sm" onClick={restoreOfficial}><RotateCcw />恢复当前官方模板</Button></div>
      </header>
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,.85fr)] lg:divide-x lg:divide-[var(--line)]">
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-2 text-[10px]"><span className="rounded-[6px] bg-[var(--brand-soft)] px-2 py-1 font-semibold text-[var(--brand-strong)]">{definition.label}</span><span className="text-[var(--muted)]">中文 · {definition.description}</span></div>
          <FormField><FormLabel>主题</FormLabel><Input value={template.subject} onChange={(event) => updateTemplate("subject", event.target.value)} required maxLength={240} /></FormField>
          <FormField><FormLabel>HTML 模板</FormLabel><Textarea value={template.html} onChange={(event) => updateTemplate("html", event.target.value)} required rows={24} className="mono min-h-[520px] text-[10px] leading-5" /></FormField>
          <div><strong className="text-[10px]">可用占位符</strong><p className="mt-1 text-[9px] text-[var(--muted)]">点击占位符可复制。后端仅替换当前事件白名单中的值。</p><div className="mt-3 flex flex-wrap gap-2">{definition.placeholders.map((name) => <button key={name} type="button" onClick={() => copyPlaceholder(name)} className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface-raised)] px-2.5 mono text-[9px] text-[var(--brand-strong)] hover:border-[var(--brand)]">{copied === name ? <Check className="size-3" /> : <Copy className="size-3" />}{`{{${name}}}`}</button>)}</div></div>
        </div>
        <aside className="bg-[var(--surface-subtle)] p-5"><div className="flex items-center justify-between"><div><strong className="text-[11px]">实时预览</strong><p className="mt-1 text-[9px] text-[var(--muted)]">预览 HTML 由后端生成，并在禁用脚本的沙盒 iframe 中展示。</p></div><Eye className="size-4 text-[var(--brand)]" /></div><div className="mt-4 overflow-hidden rounded-[var(--radius-panel)] border border-[var(--line)] bg-white shadow-[var(--shadow-sm)]"><div className="border-b border-zinc-200 px-4 py-3 text-[11px] font-semibold text-zinc-900">{preview?.subject ?? "正在生成预览..."}</div><iframe title={`${definition.label} HTML 实时预览`} sandbox="" srcDoc={preview?.html ?? ""} className="h-[600px] w-full bg-white" /></div></aside>
      </div>
    </section>

    <section className="panel overflow-hidden"><header className="border-b border-[var(--line)] px-5 py-4"><h3 className="text-[13px] font-bold">自动提醒策略</h3><p className="mt-1 text-[9px] text-[var(--muted)]">关闭策略不会删除对应模板，重新启用后继续使用当前保存内容。</p></header><div className="divide-y divide-[var(--line)]">
      <div className="grid gap-4 p-5 lg:grid-cols-[minmax(230px,1fr)_180px_minmax(260px,1fr)] lg:items-center"><AlertTitle icon={BellRing} title="余额不足提醒" description="余额降至阈值以下时通知工作区。" enabled={settings.alerts.lowBalanceEnabled} toggle={(enabled) => setSettings((current) => ({ ...current, alerts: { ...current.alerts, lowBalanceEnabled: enabled } }))} /><FormField><FormLabel>默认提醒阈值</FormLabel><InputGroup><span className="pl-3 text-[12px] text-[var(--muted)]">$</span><Input value={settings.alerts.lowBalanceThreshold} onChange={(event) => setSettings((current) => ({ ...current, alerts: { ...current.alerts, lowBalanceThreshold: event.target.value } }))} inputMode="decimal" pattern="\d{1,9}(\.\d{1,6})?" required /></InputGroup></FormField><FormField><FormLabel>充值页面 URL</FormLabel><Input type="url" value={settings.alerts.rechargeUrl} onChange={(event) => setSettings((current) => ({ ...current, alerts: { ...current.alerts, rechargeUrl: event.target.value } }))} placeholder="https://api.example.com/console/billing" /></FormField></div>
      <div className="grid gap-4 p-5 lg:grid-cols-[minmax(230px,1fr)_180px_minmax(260px,1fr)] lg:items-center"><AlertTitle icon={Gauge} title="账号限额告警" description="应用订阅的月调用量达到阈值时提醒。" enabled={settings.alerts.quotaAlertEnabled} toggle={(enabled) => setSettings((current) => ({ ...current, alerts: { ...current.alerts, quotaAlertEnabled: enabled } }))} /><FormField><FormLabel>告警阈值</FormLabel><InputGroup><Input type="number" min={1} max={100} value={settings.alerts.quotaThresholdPercent} onChange={(event) => setSettings((current) => ({ ...current, alerts: { ...current.alerts, quotaThresholdPercent: Number(event.target.value) } }))} required /><span className="pr-3 text-[12px] text-[var(--muted)]">%</span></InputGroup></FormField><p className="text-[9px] leading-4 text-[var(--muted)]">仅对设置了月调用上限且工作区已启用“配额阈值邮件提醒”的订阅生效。</p></div>
    </div></section>

    {(error || message) && (error ? <FormMessage>{error}</FormMessage> : <p role="status" className="text-[10px] text-[var(--success)]">{message}</p>)}
    <div className="flex justify-end"><Button disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Save />}{saving ? "正在保存" : "保存模板与提醒"}</Button></div>
  </form>;
}

function AlertTitle({ icon: Icon, title, description, enabled, toggle }: { icon: typeof BellRing; title: string; description: string; enabled: boolean; toggle: (enabled: boolean) => void }) {
  return <div className="flex items-center justify-between gap-4"><div className="flex gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-control)] bg-[var(--warning-soft)] text-[var(--warning)]"><Icon className="size-4" /></span><div><strong className="block text-[11px]">{title}</strong><small className="mt-1 block text-[9px] text-[var(--muted)]">{description}</small></div></div><Switch checked={enabled} onCheckedChange={toggle} aria-label={`${enabled ? "停用" : "启用"}${title}`} /></div>;
}
