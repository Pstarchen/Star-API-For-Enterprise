"use client";

import { Banknote, CheckCircle2, Landmark, Loader2, Search, X } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";

type PaymentOrderView = {
  id: string;
  orderNo: string;
  tenant: string;
  period: string | null;
  channel: "ALIPAY" | "WECHAT" | "BANK_TRANSFER";
  status: "PENDING" | "PAID" | "CANCELED" | "EXPIRED" | "REFUNDED";
  amount: string;
  externalTradeNo: string | null;
  createdAt: string;
  paidAt: string | null;
};

const channelNames = { ALIPAY: "支付宝", WECHAT: "微信支付", BANK_TRANSFER: "对公转账" } as const;
const statusNames = { PENDING: "待支付", PAID: "已支付", CANCELED: "已取消", EXPIRED: "已过期", REFUNDED: "已退款" } as const;

export function AdminPaymentsManager({ initialOrders }: { initialOrders: PaymentOrderView[] }) {
  const [orders, setOrders] = useState(initialOrders);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [channel, setChannel] = useState("ALL");
  const [confirming, setConfirming] = useState<PaymentOrderView | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return orders.filter((order) => (status === "ALL" || order.status === status) && (channel === "ALL" || order.channel === channel) && (!keyword || [order.orderNo, order.tenant, order.period, order.externalTradeNo].join(" ").toLowerCase().includes(keyword)));
  }, [channel, orders, query, status]);

  async function confirmPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirming) return;
    setSaving(true); setError(""); setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/v1/admin/payments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: confirming.id, reference: form.get("reference"), note: form.get("note") || undefined }) });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) { setError(result.message); return; }
    setOrders((items) => items.map((item) => item.id === confirming.id ? { ...item, status: "PAID", externalTradeNo: String(form.get("reference")), paidAt: result.data.paidAt } : item));
    setConfirming(null); setMessage(result.message);
  }

  return <div className="mx-auto max-w-[1440px] space-y-5">
    <PageTitle />
    {message && <div role="status" className="flex items-center gap-2 rounded-[8px] border border-[color-mix(in_srgb,var(--success)_28%,var(--line))] bg-[color-mix(in_srgb,var(--success)_8%,var(--surface))] px-4 py-3 text-[11px] text-[var(--success)]"><CheckCircle2 className="size-4" />{message}</div>}
    <section className="panel overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-[var(--line)] p-4 lg:flex-row lg:items-center">
        <label className="flex h-10 flex-1 items-center gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 lg:max-w-md"><Search className="size-4 text-[var(--muted)]" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-[11px] outline-none" placeholder="订单号、空间、账期或流水号" /></label>
        <div className="flex gap-2 overflow-x-auto"><select value={channel} onChange={(event) => setChannel(event.target.value)} className={selectClass}><option value="ALL">全部渠道</option><option value="ALIPAY">支付宝</option><option value="WECHAT">微信支付</option><option value="BANK_TRANSFER">对公转账</option></select><select value={status} onChange={(event) => setStatus(event.target.value)} className={selectClass}><option value="ALL">全部状态</option><option value="PENDING">待支付</option><option value="PAID">已支付</option><option value="EXPIRED">已过期</option><option value="CANCELED">已取消</option><option value="REFUNDED">已退款</option></select></div>
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1080px] text-left text-[10px]"><thead className="bg-[var(--surface-subtle)] text-[var(--muted)]"><tr><th className="px-5 py-3 font-semibold">订单 / 空间</th><th className="px-5 py-3 font-semibold">账期</th><th className="px-5 py-3 font-semibold">渠道</th><th className="px-5 py-3 font-semibold">金额</th><th className="px-5 py-3 font-semibold">状态</th><th className="px-5 py-3 font-semibold">交易流水</th><th className="px-5 py-3 font-semibold">创建 / 支付时间</th><th className="px-5 py-3 text-right font-semibold">操作</th></tr></thead><tbody className="divide-y divide-[var(--line)]">{filtered.map((order) => <tr key={order.id} className="transition-colors hover:bg-[var(--surface-subtle)]"><td className="px-5 py-4"><strong className="mono block text-[11px]">{order.orderNo}</strong><span className="mt-1 block text-[9px] text-[var(--muted)]">{order.tenant}</span></td><td className="px-5 py-4">{order.period ?? "未关联"}</td><td className="px-5 py-4">{channelNames[order.channel]}</td><td className="px-5 py-4 font-semibold">¥{order.amount}</td><td className="px-5 py-4"><StatusBadge status={order.status} /></td><td className="mono max-w-48 truncate px-5 py-4 text-[9px] text-[var(--muted)]">{order.externalTradeNo ?? "-"}</td><td className="px-5 py-4"><span className="block">{new Date(order.createdAt).toLocaleString("zh-CN")}</span><span className="mt-1 block text-[9px] text-[var(--muted)]">{order.paidAt ? new Date(order.paidAt).toLocaleString("zh-CN") : "尚未支付"}</span></td><td className="px-5 py-4 text-right">{order.channel === "BANK_TRANSFER" && order.status === "PENDING" ? <button onClick={() => { setConfirming(order); setError(""); }} className="inline-flex h-8 items-center gap-1.5 rounded-[7px] bg-[var(--brand)] px-3 font-semibold text-white"><Landmark className="size-3.5" />确认到账</button> : <span className="text-[var(--muted)]">自动处理</span>}</td></tr>)}</tbody></table></div>
      {!filtered.length && <div className="grid min-h-52 place-items-center px-6 text-center"><div><Banknote className="mx-auto size-6 text-[var(--muted)]" /><strong className="mt-3 block text-[12px]">没有匹配的支付订单</strong><p className="mt-1 text-[10px] text-[var(--muted)]">调整搜索条件后再试。</p></div></div>}
      <div className="border-t border-[var(--line)] px-5 py-3 text-[9px] text-[var(--muted)]">显示 {filtered.length} / {orders.length} 笔真实订单</div>
    </section>
    {confirming && <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4" onMouseDown={() => setConfirming(null)}><div role="dialog" aria-modal="true" aria-labelledby="confirm-payment-title" className="w-full max-w-md overflow-hidden rounded-[8px] border border-[var(--line)] bg-[var(--surface)] shadow-2xl" onMouseDown={(event) => event.stopPropagation()}><div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4"><div><h3 id="confirm-payment-title" className="text-[13px] font-bold">确认对公转账到账</h3><p className="mt-1 text-[9px] text-[var(--muted)]">{confirming.tenant} · ¥{confirming.amount}</p></div><button type="button" onClick={() => setConfirming(null)} className="grid size-8 place-items-center rounded-[7px] hover:bg-[var(--surface-subtle)]" aria-label="关闭"><X className="size-4" /></button></div><form onSubmit={confirmPayment} className="space-y-4 p-5"><label className="block"><span className="mb-1.5 block text-[10px] font-semibold">银行流水号</span><input name="reference" required minLength={2} maxLength={100} autoFocus className={inputClass} placeholder="用于财务核对与审计" /></label><label className="block"><span className="mb-1.5 block text-[10px] font-semibold">核销备注</span><textarea name="note" maxLength={300} rows={3} className={`${inputClass} h-auto py-3`} placeholder="可填写到账账户、核对人等信息" /></label>{error && <p role="alert" className="rounded-[8px] bg-[var(--danger-soft)] px-3 py-2 text-[10px] text-[var(--danger)]">{error}</p>}<button disabled={saving} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-[8px] bg-[var(--brand)] text-[11px] font-semibold text-white disabled:opacity-60">{saving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}{saving ? "正在核销" : "确认款项已到账"}</button></form></div></div>}
  </div>;
}

function PageTitle() { return <div><p className="eyebrow">PAYMENT OPERATIONS</p><h2 className="mt-1 text-xl font-bold">支付订单与人工核销</h2><p className="mt-1 text-[11px] text-[var(--muted)]">线上支付由签名回调自动确认，对公转账由管理员核对银行流水后确认。</p></div>; }
function StatusBadge({ status }: { status: PaymentOrderView["status"] }) { const tone = status === "PAID" ? "text-[var(--success)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)]" : status === "PENDING" ? "text-[var(--warning)] bg-[var(--warning-soft)]" : "text-[var(--muted)] bg-[var(--surface-subtle)]"; return <span className={`inline-flex rounded-full px-2.5 py-1 text-[9px] font-semibold ${tone}`}>{statusNames[status]}</span>; }
const selectClass = "h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[10px]";
const inputClass = "h-10 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[11px] outline-none focus:border-[var(--brand)]";
