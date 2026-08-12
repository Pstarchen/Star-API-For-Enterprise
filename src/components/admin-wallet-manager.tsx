"use client";

import { ArrowDownToLine, ArrowUpFromLine, CheckCircle2, Loader2, Search, WalletCards, X } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Button } from "./ui/button";
import { Input, Textarea } from "./ui/input";

export type WalletTenantView = {
  id: string;
  name: string;
  type: "PERSONAL" | "ENTERPRISE";
  balance: string;
  members: { id: string; name: string; email: string }[];
  recentEntries: WalletEntryView[];
};

type WalletEntryView = { id: string; type: string; delta: string; balanceAfter: string; reason: string; createdAt: string };

export function AdminWalletManager({ initialTenants }: { initialTenants: WalletTenantView[] }) {
  const [tenants, setTenants] = useState(initialTenants);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<WalletTenantView | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return tenants.filter((tenant) => !keyword || [tenant.name, tenant.id, ...tenant.members.flatMap((member) => [member.name, member.email])].join(" ").toLowerCase().includes(keyword));
  }, [query, tenants]);

  async function adjust(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true); setError(""); setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/v1/admin/wallet", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenantId: selected.id, type: form.get("type"), amount: form.get("amount"), reason: form.get("reason") }) });
    const result = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) { setError(result.message ?? "余额调整失败"); return; }
    const entry = result.data.entry as WalletEntryView;
    const next = { ...selected, balance: result.data.balance, recentEntries: [entry, ...selected.recentEntries].slice(0, 8) };
    setTenants((items) => items.map((item) => item.id === selected.id ? next : item));
    setSelected(next);
    setMessage(result.message);
    event.currentTarget.reset();
  }

  return <div className="mx-auto max-w-[1440px] space-y-5">
    <div><p className="eyebrow">WALLET OPERATIONS</p><h2 className="mt-1 text-xl font-bold">余额与退款管理</h2><p className="mt-1 text-[11px] text-[var(--muted)]">所有人工调整都会写入钱包流水和审计日志；退款只扣减平台余额，不代表原路退款。</p></div>
    {message && <div role="status" className="flex items-center gap-2 rounded-[var(--radius-control)] bg-[var(--success-soft)] px-4 py-3 text-[11px] text-[var(--success)]"><CheckCircle2 className="size-4" />{message}</div>}
    <section className="panel overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-[var(--line)] p-4 sm:flex-row sm:items-center"><label className="flex h-10 flex-1 items-center gap-2 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface-raised)] px-3 sm:max-w-md"><Search className="size-4 text-[var(--muted)]" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-[11px] outline-none" placeholder="搜索工作区、邮箱或 ID" /></label><span className="text-[10px] text-[var(--muted)]">{filtered.length} 个工作区</span></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-[10px]"><thead className="bg-[var(--surface-subtle)] text-[var(--muted)]"><tr><th className="px-5 py-3">工作区</th><th className="px-5 py-3">账号</th><th className="px-5 py-3">当前余额</th><th className="px-5 py-3">最近变动</th><th className="px-5 py-3 text-right">操作</th></tr></thead><tbody className="divide-y divide-[var(--line)]">{filtered.map((tenant) => <tr key={tenant.id} className="hover:bg-[var(--surface-subtle)]"><td className="px-5 py-4"><strong className="block">{tenant.name}</strong><span className="mono text-[9px] text-[var(--muted)]">{tenant.id}</span></td><td className="px-5 py-4"><span className="block">{tenant.members[0]?.name ?? "-"}</span><span className="text-[9px] text-[var(--muted)]">{tenant.members[0]?.email ?? "无绑定账号"}</span></td><td className="px-5 py-4 font-semibold">¥{tenant.balance}</td><td className="px-5 py-4">{tenant.recentEntries[0] ? <span className={Number(tenant.recentEntries[0].delta) >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}>{Number(tenant.recentEntries[0].delta) >= 0 ? "+" : ""}¥{tenant.recentEntries[0].delta}</span> : <span className="text-[var(--muted)]">暂无流水</span>}</td><td className="px-5 py-4 text-right"><Button size="sm" variant="secondary" onClick={() => { setSelected(tenant); setError(""); setMessage(""); }}>管理余额</Button></td></tr>)}</tbody></table></div>
      {!filtered.length && <div className="grid min-h-52 place-items-center text-center"><div><WalletCards className="mx-auto size-6 text-[var(--muted)]" /><strong className="mt-3 block text-[12px]">暂无匹配工作区</strong></div></div>}
    </section>
    {selected && <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4" onMouseDown={() => setSelected(null)}><div role="dialog" aria-modal="true" aria-labelledby="wallet-dialog-title" className="w-full max-w-lg overflow-hidden rounded-[var(--radius-panel)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-lg)]" onMouseDown={(event) => event.stopPropagation()}><div className="flex items-start justify-between border-b border-[var(--line)] px-5 py-4"><div><h3 id="wallet-dialog-title" className="text-[14px] font-bold">调整 {selected.name}</h3><p className="mt-1 text-[10px] text-[var(--muted)]">当前余额 ¥{selected.balance} · {selected.members[0]?.email ?? "无绑定邮箱"}</p></div><button type="button" onClick={() => setSelected(null)} className="grid size-8 place-items-center rounded-[var(--radius-control)] text-[var(--muted)] hover:bg-[var(--surface-subtle)]" aria-label="关闭"><X className="size-4" /></button></div><form onSubmit={adjust} className="space-y-4 p-5"><label className="block"><span className="mb-1.5 block text-[10px] font-semibold">操作</span><Select name="type" defaultValue="ADMIN_RECHARGE"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ADMIN_RECHARGE"><span className="inline-flex items-center gap-2"><ArrowDownToLine className="size-3.5" />管理员充值</span></SelectItem><SelectItem value="ADMIN_REFUND"><span className="inline-flex items-center gap-2"><ArrowUpFromLine className="size-3.5" />余额退款</span></SelectItem></SelectContent></Select></label><label className="block"><span className="mb-1.5 block text-[10px] font-semibold">金额</span><Input name="amount" required type="number" min="0.01" max="100000000" step="0.01" placeholder="0.00" /></label><label className="block"><span className="mb-1.5 block text-[10px] font-semibold">原因</span><Textarea name="reason" required minLength={2} maxLength={200} rows={3} placeholder="例如：企业合同赠送额度、退款申请单号" /></label>{error && <p role="alert" className="rounded-[var(--radius-control)] bg-[var(--danger-soft)] px-3 py-2 text-[10px] text-[var(--danger)]">{error}</p>}<Button disabled={saving} className="w-full">{saving ? <Loader2 className="animate-spin" /> : <WalletCards />}{saving ? "正在提交" : "确认调整余额"}</Button></form><div className="border-t border-[var(--line)] bg-[var(--surface-subtle)] px-5 py-4"><h4 className="text-[10px] font-bold">最近流水</h4><div className="mt-2 space-y-2">{selected.recentEntries.map((entry) => <div key={entry.id} className="flex items-center justify-between gap-3 text-[9px]"><span className="min-w-0 truncate">{entry.reason}</span><span className={Number(entry.delta) >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}>{Number(entry.delta) >= 0 ? "+" : ""}¥{entry.delta}</span></div>)}{!selected.recentEntries.length && <span className="text-[9px] text-[var(--muted)]">暂无流水</span>}</div></div></div></div>}
  </div>;
}
