"use client";

import { Check, Copy, CreditCard, Landmark, Loader2, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { type FormEvent, useState } from "react";

type Invoice = { id: string; period: string; amount: string };
type Order = { id: string; orderNo: string; channel: "ALIPAY" | "WECHAT" | "BANK_TRANSFER"; status: string; amount: string; createdAt: string; paidAt: string | null };
type Channel = { key: "alipay" | "wechat" | "bank-transfer"; enabled: boolean; configured: boolean };
type PaymentResult = { orderNo: string; channel: Order["channel"]; amount: string; paymentUrl: string | null; bank: Record<string, unknown> | null };
const channelNames = { ALIPAY: "支付宝", WECHAT: "微信支付", BANK_TRANSFER: "对公转账" } as const;
const statusNames: Record<string, string> = { PENDING: "待支付", PAID: "已支付", CANCELED: "已取消", EXPIRED: "已过期", REFUNDED: "已退款" };

export function PaymentManager({ invoices, initialOrders, channels }: { invoices: Invoice[]; initialOrders: Order[]; channels: Channel[] }) {
  const [orders, setOrders] = useState(initialOrders);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PaymentResult | null>(null);
  const [copied, setCopied] = useState(false);
  const available = channels.filter((item) => item.enabled && item.configured);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/v1/payments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invoiceId: form.get("invoiceId"), channel: form.get("channel") }) });
    const body = await response.json(); setSaving(false);
    if (!response.ok) { setError(body.message); return; }
    const payment = body.data as PaymentResult;
    setOrders((items) => [{ id: payment.orderNo, orderNo: payment.orderNo, channel: payment.channel, status: "PENDING", amount: payment.amount, createdAt: new Date().toISOString(), paidAt: null }, ...items]);
    setOpen(false);
    if (payment.channel === "ALIPAY" && payment.paymentUrl) { window.location.assign(payment.paymentUrl); return; }
    setResult(payment);
  }

  async function copyOrderNo() { if (!result) return; await navigator.clipboard.writeText(result.orderNo); setCopied(true); window.setTimeout(() => setCopied(false), 1200); }

  return <section className="panel overflow-hidden"><div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4"><div><h3 className="text-[13px] font-bold">支付订单</h3><p className="mt-1 text-[9px] text-[var(--muted)]">仅可支付状态为“已出账”的真实账单。</p></div><button onClick={() => setOpen(true)} disabled={!invoices.length || !available.length} className="inline-flex h-9 items-center gap-2 rounded-[6px] bg-[var(--brand)] px-4 text-[10px] font-semibold text-white disabled:opacity-50"><CreditCard className="size-3.5" />支付账单</button></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-[10px]"><thead className="bg-[var(--surface-subtle)] text-[var(--muted)]"><tr><th className="px-5 py-3">订单号</th><th className="px-5 py-3">渠道</th><th className="px-5 py-3">金额</th><th className="px-5 py-3">状态</th><th className="px-5 py-3">创建时间</th><th className="px-5 py-3">支付时间</th></tr></thead><tbody className="divide-y divide-[var(--line)]">{orders.map((order) => <tr key={order.id}><td className="mono px-5 py-4">{order.orderNo}</td><td className="px-5 py-4">{channelNames[order.channel]}</td><td className="px-5 py-4">¥{order.amount}</td><td className="px-5 py-4">{statusNames[order.status] ?? order.status}</td><td className="px-5 py-4">{new Date(order.createdAt).toLocaleString("zh-CN")}</td><td className="px-5 py-4">{order.paidAt ? new Date(order.paidAt).toLocaleString("zh-CN") : "-"}</td></tr>)}</tbody></table></div>{!orders.length && <div className="py-12 text-center text-[10px] text-[var(--muted)]">暂无支付订单</div>}{open && <Modal title="支付已出账账单" close={() => setOpen(false)}><form onSubmit={create} className="space-y-4"><Field label="账单"><select name="invoiceId" className={inputClass}>{invoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.period} · ¥{invoice.amount}</option>)}</select></Field><Field label="支付渠道"><select name="channel" className={inputClass}>{available.map((channel) => <option key={channel.key} value={channel.key === "alipay" ? "ALIPAY" : channel.key === "wechat" ? "WECHAT" : "BANK_TRANSFER"}>{channel.key === "alipay" ? "支付宝" : channel.key === "wechat" ? "微信支付" : "对公转账"}</option>)}</select></Field>{error && <p className="rounded-[6px] bg-[var(--danger-soft)] p-3 text-[10px] text-[var(--danger)]">{error}</p>}<button disabled={saving} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-[6px] bg-[var(--brand)] text-[10px] font-semibold text-white">{saving && <Loader2 className="size-3.5 animate-spin" />}{saving ? "正在创建订单" : "确认支付"}</button></form></Modal>}{result && <Modal title={result.channel === "WECHAT" ? "微信扫码支付" : "对公转账信息"} close={() => setResult(null)}>{result.channel === "WECHAT" && result.paymentUrl ? <div className="text-center"><QRCodeSVG value={result.paymentUrl} size={220} className="mx-auto rounded-[6px] bg-white p-3" /><p className="mt-3 text-[10px] text-[var(--muted)]">订单 {result.orderNo} · ¥{result.amount}</p></div> : <div className="space-y-3"><Landmark className="size-5 text-[var(--brand)]" /><Bank label="账户名称" value={String(result.bank?.accountName ?? "未配置")} /><Bank label="开户银行" value={String(result.bank?.bankName ?? "未配置")} /><Bank label="银行账号" value={String(result.bank?.accountNumber ?? "未配置")} /><Bank label="附言/备注" value={result.orderNo} /><button onClick={copyOrderNo} className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-[6px] border border-[var(--line)] text-[10px]">{copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}{copied ? "已复制" : "复制订单号"}</button><p className="text-[9px] text-[var(--muted)]">{String(result.bank?.instructions ?? "")}</p></div>}</Modal>}</section>;
}

const inputClass = "h-10 w-full rounded-[6px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[11px]";
function Modal({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) { return <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4" onMouseDown={close}><div className="w-full max-w-md rounded-[8px] bg-[var(--surface)] shadow-2xl" onMouseDown={(event) => event.stopPropagation()}><div className="flex justify-between border-b border-[var(--line)] px-5 py-4"><h3 className="text-[13px] font-bold">{title}</h3><button onClick={close}><X className="size-4" /></button></div><div className="p-5">{children}</div></div></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-[10px] font-semibold">{label}</span>{children}</label>; }
function Bank({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-4 rounded-[6px] bg-[var(--surface-subtle)] p-3 text-[10px]"><span className="text-[var(--muted)]">{label}</span><strong className="text-right">{value}</strong></div>; }
