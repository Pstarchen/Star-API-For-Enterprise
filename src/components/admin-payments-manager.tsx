"use client";

import { Banknote, CheckCircle2, Loader2, Search } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { epayPaymentTypeNames, paymentChannelNames, type EpayPaymentType, type PaymentChannelValue } from "@/lib/payment-options";
import { Button } from "./ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input, Textarea } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

type PaymentOrderView = { id: string; orderNo: string; orderType: "INVOICE" | "RECHARGE"; tenant: string; period: string | null; channel: PaymentChannelValue; providerName: string | null; paymentType: string | null; status: "PENDING" | "PAID" | "CANCELED" | "EXPIRED" | "REFUNDED"; amount: string; externalTradeNo: string | null; createdAt: string; paidAt: string | null };
const statusNames = { PENDING: "待支付", PAID: "已支付", CANCELED: "已取消", EXPIRED: "已过期", REFUNDED: "已退款" } as const;

export function AdminPaymentsManager({ initialOrders }: { initialOrders: PaymentOrderView[] }) {
  const [orders, setOrders] = useState(initialOrders);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [type, setType] = useState("ALL");
  const [confirming, setConfirming] = useState<PaymentOrderView | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const filtered = useMemo(() => { const keyword = query.trim().toLowerCase(); return orders.filter((order) => (status === "ALL" || order.status === status) && (type === "ALL" || order.orderType === type) && (!keyword || [order.orderNo, order.tenant, order.period, order.externalTradeNo, order.providerName, order.paymentType].join(" ").toLowerCase().includes(keyword))); }, [orders, query, status, type]);

  async function confirmPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!confirming) return; setSaving(true); setError(""); setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/v1/admin/payments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: confirming.id, reference: form.get("reference"), note: form.get("note") || undefined }) });
    const result = await response.json().catch(() => ({})); setSaving(false);
    if (!response.ok) { setError(result.message ?? "订单确认失败"); return; }
    setOrders((items) => items.map((item) => item.id === confirming.id ? { ...item, status: "PAID", externalTradeNo: String(form.get("reference")), paidAt: result.data.paidAt } : item));
    setConfirming(null); setMessage(result.message);
  }

  return <div className="mx-auto max-w-[1440px] space-y-5">
    <div><p className="eyebrow">PAYMENT OPERATIONS</p><h2 className="mt-1 text-xl font-bold">支付订单与人工核验</h2><p className="mt-1 text-[11px] text-[var(--muted)]">官方直连与易支付由签名回调自动确认；对公转账和码支付由管理员核对凭证后入账。</p></div>
    {message && <div role="status" className="flex items-center gap-2 rounded-[var(--radius-control)] bg-[var(--success-soft)] px-4 py-3 text-[11px] text-[var(--success)]"><CheckCircle2 className="size-4" />{message}</div>}
    <section className="panel overflow-hidden"><div className="flex flex-col gap-3 border-b border-[var(--line)] p-4 lg:flex-row lg:items-center"><label className="flex h-10 flex-1 items-center gap-2 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface-raised)] px-3 lg:max-w-md"><Search className="size-4 text-[var(--muted)]" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-[11px] outline-none" placeholder="订单号、工作区、服务商或流水号" /></label><div className="flex gap-2"><Select value={type} onValueChange={setType}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">全部订单</SelectItem><SelectItem value="INVOICE">账单支付</SelectItem><SelectItem value="RECHARGE">余额充值</SelectItem></SelectContent></Select><Select value={status} onValueChange={setStatus}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">全部状态</SelectItem><SelectItem value="PENDING">待支付</SelectItem><SelectItem value="PAID">已支付</SelectItem><SelectItem value="EXPIRED">已过期</SelectItem><SelectItem value="CANCELED">已取消</SelectItem><SelectItem value="REFUNDED">已退款</SelectItem></SelectContent></Select></div></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1160px] text-left text-[10px]"><thead className="bg-[var(--surface-subtle)] text-[var(--muted)]"><tr><th className="px-5 py-3">订单 / 工作区</th><th className="px-5 py-3">类型</th><th className="px-5 py-3">渠道</th><th className="px-5 py-3">金额</th><th className="px-5 py-3">状态</th><th className="px-5 py-3">交易流水</th><th className="px-5 py-3">创建时间</th><th className="px-5 py-3 text-right">操作</th></tr></thead><tbody className="divide-y divide-[var(--line)]">{filtered.map((order) => <tr key={order.id} className="hover:bg-[var(--surface-subtle)]"><td className="px-5 py-4"><strong className="mono block">{order.orderNo}</strong><span className="mt-1 block text-[9px] text-[var(--muted)]">{order.tenant}</span></td><td className="px-5 py-4">{order.orderType === "RECHARGE" ? "余额充值" : order.period ?? "账单"}</td><td className="px-5 py-4"><strong className="block">{paymentChannelNames[order.channel]}</strong>{order.channel === "EPAY" && <span className="mt-1 block text-[9px] text-[var(--muted)]">{order.providerName ?? "历史服务商"}{order.paymentType ? ` · ${epayPaymentTypeNames[order.paymentType as EpayPaymentType] ?? order.paymentType}` : ""}</span>}</td><td className="px-5 py-4 font-semibold">¥{order.amount}</td><td className="px-5 py-4"><span className={order.status === "PAID" ? "text-[var(--success)]" : order.status === "PENDING" ? "text-[var(--warning)]" : "text-[var(--muted)]"}>{statusNames[order.status]}</span></td><td className="mono max-w-48 truncate px-5 py-4 text-[9px] text-[var(--muted)]">{order.externalTradeNo ?? "-"}</td><td className="px-5 py-4">{new Date(order.createdAt).toLocaleString("zh-CN")}</td><td className="px-5 py-4 text-right">{(order.channel === "BANK_TRANSFER" || order.channel === "CODE_PAY") && order.status === "PENDING" ? <Button size="sm" onClick={() => { setConfirming(order); setError(""); }}><CheckCircle2 />确认到账</Button> : <span className="text-[var(--muted)]">自动处理</span>}</td></tr>)}</tbody></table></div>
      {!filtered.length && <div className="grid min-h-52 place-items-center px-6 text-center"><div><Banknote className="mx-auto size-6 text-[var(--muted)]" /><strong className="mt-3 block text-[12px]">没有匹配的支付订单</strong></div></div>}
      <div className="border-t border-[var(--line)] px-5 py-3 text-[9px] text-[var(--muted)]">显示 {filtered.length} / {orders.length} 笔真实订单</div>
    </section>
    <Dialog open={Boolean(confirming)} onOpenChange={(next) => { if (!next && !saving) setConfirming(null); }}><DialogContent className="max-w-md p-0" showClose={!saving}><DialogHeader><DialogTitle>确认订单到账</DialogTitle><DialogDescription>{confirming?.tenant} · ¥{confirming?.amount} · {confirming ? paymentChannelNames[confirming.channel] : ""}</DialogDescription></DialogHeader>{confirming && <DialogBody><form onSubmit={confirmPayment} className="space-y-4"><label className="block"><span className="mb-1.5 block text-[10px] font-semibold">支付凭证 / 流水号</span><Input name="reference" required minLength={2} maxLength={100} autoFocus placeholder="用于财务核对与审计" /></label><label className="block"><span className="mb-1.5 block text-[10px] font-semibold">核验备注</span><Textarea name="note" maxLength={300} rows={3} placeholder="可填写付款人、截图编号或核对人" /></label>{error && <p role="alert" className="rounded-[var(--radius-control)] bg-[var(--danger-soft)] px-3 py-2 text-[10px] text-[var(--danger)]">{error}</p>}<Button disabled={saving} className="w-full">{saving ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}{saving ? "正在核验" : "确认到账"}</Button></form></DialogBody>}</DialogContent></Dialog>
  </div>;
}
