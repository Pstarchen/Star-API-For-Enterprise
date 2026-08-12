"use client";

import { Activity, Gauge, Infinity as InfinityIcon, ListChecks, Loader2, Pencil, Search, ShieldAlert, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";
import type { AdminSubscriptionView } from "@/lib/server/admin-subscriptions";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

const statusCopy = {
  ACTIVE: { label: "生效中", variant: "success" as const },
  PAUSED: { label: "已暂停", variant: "warning" as const },
  CANCELED: { label: "已取消", variant: "neutral" as const },
};

const inputClass = "h-10 w-full rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-[11px] text-[var(--ink)] shadow-[var(--shadow-inset)] outline-none transition hover:border-[var(--line-strong)] focus:border-[var(--brand)] focus:ring-3 focus:ring-[var(--focus-soft)]";

function formatCount(value: number | string) {
  return BigInt(value).toLocaleString("zh-CN");
}

function usagePercent(item: AdminSubscriptionView) {
  const quota = Number(item.quotaMonthly);
  return quota > 0 ? Math.min(100, (item.usageThisMonth / quota) * 100) : null;
}

export function AdminSubscriptionManager({ initialSubscriptions }: { initialSubscriptions: AdminSubscriptionView[] }) {
  const [subscriptions, setSubscriptions] = useState(initialSubscriptions);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [editing, setEditing] = useState<AdminSubscriptionView | null>(null);
  const [quotaMonthly, setQuotaMonthly] = useState("");
  const [qpsLimit, setQpsLimit] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return subscriptions.filter((item) => (status === "ALL" || item.status === status)
      && (!keyword || [item.tenant.name, item.app.name, item.product.name, item.product.slug].join(" ").toLowerCase().includes(keyword)));
  }, [query, status, subscriptions]);

  const metrics = useMemo(() => ({
    active: subscriptions.filter((item) => item.status === "ACTIVE").length,
    limited: subscriptions.filter((item) => BigInt(item.quotaMonthly) > BigInt(0)).length,
    today: subscriptions.reduce((sum, item) => sum + item.usageToday, 0),
    nearing: subscriptions.filter((item) => (usagePercent(item) ?? 0) >= 80).length,
  }), [subscriptions]);

  function openEditor(item: AdminSubscriptionView) {
    setEditing(item);
    setQuotaMonthly(item.quotaMonthly);
    setQpsLimit(String(item.qpsLimit));
    setError("");
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/v1/admin/subscriptions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editing.id, quotaMonthly, qpsLimit }),
      });
      const result = await response.json();
      if (!response.ok) {
        const details = result.details?.fieldErrors ? Object.values(result.details.fieldErrors).flat().filter(Boolean).join("；") : "";
        setError(details || result.message || "订阅策略保存失败");
        return;
      }
      const nextQuota = String(Number(quotaMonthly));
      const nextQps = Number(qpsLimit);
      setSubscriptions((items) => items.map((item) => item.id === editing.id ? { ...item, quotaMonthly: nextQuota, qpsLimit: nextQps } : item));
      setMessage(`${editing.tenant.name} / ${editing.product.name} 的策略已更新`);
      setEditing(null);
    } catch {
      setError("无法连接订阅策略服务");
    } finally {
      setSaving(false);
    }
  }

  return <div className="page-shell space-y-5">
    <div className="page-heading">
      <div><p className="eyebrow">SUBSCRIPTION POLICY</p><h2 className="page-title mt-1">订阅配额与限流</h2><p className="page-description mt-1">按企业、应用和 API 管理月调用配额与瞬时 QPS，所有用量来自真实网关日志。</p></div>
    </div>

    {message && <div role="status" className="flex items-center justify-between rounded-[var(--radius-control)] border border-[var(--success-line)] bg-[var(--success-soft)] px-4 py-3 text-[11px] text-[var(--success)]"><span>{message}</span><button type="button" onClick={() => setMessage("")} className="font-semibold">关闭</button></div>}

    <section className="ops-scoreboard" aria-label="订阅策略指标">
      <Metric icon={ListChecks} label="生效订阅" value={formatCount(metrics.active)} note={`共 ${formatCount(subscriptions.length)} 条订阅`} tone="brand" />
      <Metric icon={Gauge} label="设置月配额" value={formatCount(metrics.limited)} note="其余订阅不限月用量" tone="aqua" />
      <Metric icon={Activity} label="今日调用" value={formatCount(metrics.today)} note="按订阅关系实时汇总" tone="accent" />
      <Metric icon={ShieldAlert} label="接近限额" value={formatCount(metrics.nearing)} note="本月用量已达到 80%" tone="warning" />
    </section>

    <section className="panel overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-[var(--line)] p-4 sm:flex-row sm:items-center">
        <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface-raised)] px-3 sm:max-w-xl"><Search className="size-4 shrink-0 text-[var(--muted)]" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-[11px] outline-none" placeholder="搜索企业、应用、API 或标识" aria-label="搜索订阅" /></label>
        <Select value={status} onValueChange={setStatus}><SelectTrigger className="w-full sm:w-36" aria-label="订阅状态"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">全部状态</SelectItem><SelectItem value="ACTIVE">生效中</SelectItem><SelectItem value="PAUSED">已暂停</SelectItem><SelectItem value="CANCELED">已取消</SelectItem></SelectContent></Select>
      </div>

      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[1080px] text-left text-[10px]">
          <thead className="bg-[var(--surface-subtle)] text-[var(--muted)]"><tr><th className="px-5 py-3">企业与应用</th><th className="px-5 py-3">API</th><th className="px-5 py-3">本月用量</th><th className="px-5 py-3">今日</th><th className="px-5 py-3">QPS</th><th className="px-5 py-3">价格</th><th className="px-5 py-3">状态</th><th className="px-5 py-3 text-right">操作</th></tr></thead>
          <tbody className="divide-y divide-[var(--line)]">{filtered.map((item) => <SubscriptionRow key={item.id} item={item} edit={() => openEditor(item)} />)}</tbody>
        </table>
      </div>

      <div className="divide-y divide-[var(--line)] lg:hidden">{filtered.map((item) => <SubscriptionCard key={item.id} item={item} edit={() => openEditor(item)} />)}</div>
      {!filtered.length && <EmptyState hasSubscriptions={Boolean(subscriptions.length)} />}
      <footer className="border-t border-[var(--line)] px-5 py-3 text-[9px] text-[var(--muted)]">显示 {filtered.length} / {subscriptions.length} 条真实订阅</footer>
    </section>

    <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open && !saving) setEditing(null); }}>
      <DialogContent className="max-w-[520px] p-0" showClose={!saving}>
        {editing && <><DialogHeader><DialogTitle>编辑订阅策略</DialogTitle><DialogDescription>{editing.tenant.name} · {editing.app.name} · {editing.product.name}</DialogDescription></DialogHeader>
          <DialogBody className="space-y-5">
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--line)]"><ReadMetric label="本月已调用" value={`${formatCount(editing.usageThisMonth)} 次`} /><ReadMetric label="今日已调用" value={`${formatCount(editing.usageToday)} 次`} /></div>
            <div className="grid gap-4 sm:grid-cols-2"><Field label="每月配额" hint="0 表示不限量"><input value={quotaMonthly} onChange={(event) => setQuotaMonthly(event.target.value)} type="number" min="0" max="1000000000" step="1" className={inputClass} /></Field><Field label="QPS 限制" hint="每秒最多通过的请求"><input value={qpsLimit} onChange={(event) => setQpsLimit(event.target.value)} type="number" min="1" max="100000" step="1" className={inputClass} /></Field></div>
            {error && <p role="alert" className="rounded-[var(--radius-control)] border border-[var(--danger-line)] bg-[var(--danger-soft)] px-3 py-2.5 text-[10px] text-[var(--danger)]">{error}</p>}
          </DialogBody>
          <DialogFooter><Button type="button" variant="secondary" size="sm" disabled={saving} onClick={() => setEditing(null)}>取消</Button><Button type="button" size="sm" disabled={saving} onClick={save}>{saving ? <Loader2 className="animate-spin" /> : <ListChecks />}{saving ? "正在保存" : "保存策略"}</Button></DialogFooter></>}
      </DialogContent>
    </Dialog>
  </div>;
}

function Metric({ icon: Icon, label, value, note, tone }: { icon: typeof ListChecks; label: string; value: string; note: string; tone: "brand" | "aqua" | "accent" | "warning" }) {
  return <div className={`ops-metric tone-${tone}`}><div><span>{label}</span><strong>{value}</strong><small>{note}</small></div><Icon /></div>;
}

function SubscriptionRow({ item, edit }: { item: AdminSubscriptionView; edit: () => void }) {
  const percent = usagePercent(item);
  return <tr className="hover:bg-[var(--surface-subtle)]"><td className="px-5 py-4"><strong className="block text-[11px]">{item.tenant.name}</strong><span className="mt-1 block text-[9px] text-[var(--muted)]">{item.app.name} · {item.app.environment === "PRODUCTION" ? "生产" : "测试"}</span></td><td className="px-5 py-4"><strong className="block text-[11px]">{item.product.name}</strong><code className="mono mt-1 block text-[9px] text-[var(--muted)]">{item.product.slug}</code></td><td className="w-56 px-5 py-4"><Usage item={item} percent={percent} /></td><td className="px-5 py-4">{formatCount(item.usageToday)}</td><td className="px-5 py-4"><strong>{formatCount(item.qpsLimit)}</strong></td><td className="px-5 py-4">¥{item.unitPrice}/次</td><td className="px-5 py-4"><Badge variant={statusCopy[item.status].variant}>{statusCopy[item.status].label}</Badge></td><td className="px-5 py-4 text-right"><Button type="button" variant="secondary" size="sm" onClick={edit}><Pencil />编辑</Button></td></tr>;
}

function SubscriptionCard({ item, edit }: { item: AdminSubscriptionView; edit: () => void }) {
  const percent = usagePercent(item);
  return <article className="p-4"><div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><strong className="block truncate text-[12px]">{item.product.name}</strong><code className="mono mt-1 block truncate text-[9px] text-[var(--muted)]">{item.product.slug}</code></div><Badge variant={statusCopy[item.status].variant}>{statusCopy[item.status].label}</Badge></div><div className="mt-3 flex items-center gap-2 text-[10px]"><UsersRound className="size-3.5 shrink-0 text-[var(--brand)]" /><span className="min-w-0 truncate">{item.tenant.name} · {item.app.name}</span></div><div className="mt-4"><Usage item={item} percent={percent} /></div><div className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--line)]"><ReadMetric label="今日" value={formatCount(item.usageToday)} /><ReadMetric label="QPS" value={formatCount(item.qpsLimit)} /><ReadMetric label="价格" value={`¥${item.unitPrice}`} /></div><Button type="button" variant="secondary" size="sm" className="mt-4 w-full" onClick={edit}><Pencil />编辑策略</Button></article>;
}

function Usage({ item, percent }: { item: AdminSubscriptionView; percent: number | null }) {
  return <div><div className="flex items-center justify-between gap-2"><span>{formatCount(item.usageThisMonth)} 次</span><span className="inline-flex items-center gap-1 text-[9px] text-[var(--muted)]">{percent === null ? <><InfinityIcon className="size-3" />不限</> : `${formatCount(item.quotaMonthly)} 次`}</span></div>{percent !== null && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-strong)]"><span className={`block h-full rounded-full ${percent >= 80 ? "bg-[var(--warning)]" : "bg-[var(--brand)]"}`} style={{ width: `${percent}%` }} /></div>}</div>;
}

function ReadMetric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 bg-[var(--surface-subtle)] px-3 py-3"><span className="block truncate text-[8px] text-[var(--muted)]">{label}</span><strong className="mt-1 block truncate text-[10px]">{value}</strong></div>;
}

function Field({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return <label><span className="mb-1.5 flex items-center justify-between gap-2 text-[10px] font-semibold"><span>{label}</span><small className="font-normal text-[var(--muted)]">{hint}</small></span>{children}</label>;
}

function EmptyState({ hasSubscriptions }: { hasSubscriptions: boolean }) {
  return <div className="py-16 text-center"><ListChecks className="mx-auto size-7 text-[var(--muted)]" /><p className="mt-3 text-[12px] font-semibold">{hasSubscriptions ? "没有符合条件的订阅" : "暂无订阅关系"}</p><p className="mt-1 text-[10px] text-[var(--muted)]">{hasSubscriptions ? "调整搜索词或状态筛选后重试。" : "用户为应用订阅已发布 API 后会出现在这里。"}</p></div>;
}
