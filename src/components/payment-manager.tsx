"use client";

import { Check, Copy, CreditCard, ExternalLink, Landmark, Loader2, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { type FormEvent, useState } from "react";
import { epayPaymentTypeNames, paymentChannelNames, type EpayPaymentType, type PaymentChannelValue, type PaymentProviderOption } from "@/lib/payment-options";
import { PaymentMethodSelector, type DirectPaymentChannel } from "./payment-method-selector";
import { Button } from "./ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

type Invoice = { id: string; period: string; amount: string };
type Order = { id: string; orderNo: string; channel: PaymentChannelValue; providerName: string | null; paymentType: string | null; status: string; amount: string; createdAt: string; paidAt: string | null };
type PaymentResult = { orderNo: string; channel: PaymentChannelValue; amount: string; paymentUrl: string | null; providerName: string | null; paymentType: string | null; bank: Record<string, unknown> | null; codePay: Record<string, unknown> | null };
const statusNames: Record<string, string> = { PENDING: "待支付", PAID: "已支付", CANCELED: "已取消", EXPIRED: "已过期", REFUNDED: "已退款" };

export function PaymentManager({ invoices, initialOrders, channels, paymentProviders }: { invoices: Invoice[]; initialOrders: Order[]; channels: DirectPaymentChannel[]; paymentProviders: readonly PaymentProviderOption[] }) {
  const [orders, setOrders] = useState(initialOrders);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PaymentResult | null>(null);
  const [copied, setCopied] = useState(false);
  const available = channels.some((item) => item.enabled && item.configured) || paymentProviders.length > 0;

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    const form = new FormData(event.currentTarget);
    const channel = String(form.get("channel"));
    try {
      const response = await fetch("/api/v1/payments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderType: "INVOICE", invoiceId: form.get("invoiceId"), channel, ...(channel === "EPAY" ? { paymentProviderId: form.get("paymentProviderId"), paymentType: form.get("paymentType") } : {}) }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setError(body.message ?? "支付订单创建失败"); return; }
      const payment = body.data as PaymentResult;
      setOrders((items) => [{ id: payment.orderNo, orderNo: payment.orderNo, channel: payment.channel, providerName: payment.providerName, paymentType: payment.paymentType, status: "PENDING", amount: payment.amount, createdAt: new Date().toISOString(), paidAt: null }, ...items]);
      setOpen(false); setResult(payment);
      if ((payment.channel === "ALIPAY" || payment.channel === "EPAY") && payment.paymentUrl) window.location.assign(payment.paymentUrl);
    } catch {
      setError("无法连接支付服务，请检查网络后重试");
    } finally {
      setSaving(false);
    }
  }

  async function copyOrderNo() { if (!result) return; await navigator.clipboard.writeText(result.orderNo); setCopied(true); window.setTimeout(() => setCopied(false), 1200); }

  return <section className="panel overflow-hidden">
    <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4"><div><h3 className="text-[13px] font-bold">账单支付订单</h3><p className="mt-1 text-[9px] text-[var(--muted)]">仅可支付状态为“已出账”的真实账单。</p></div><Button size="sm" onClick={() => { setOpen(true); setError(""); }} disabled={!invoices.length || !available}><CreditCard />支付账单</Button></div>
    <div className="overflow-x-auto"><table className="w-full min-w-[840px] text-left text-[10px]"><thead className="bg-[var(--surface-subtle)] text-[var(--muted)]"><tr><th className="px-5 py-3">订单号</th><th className="px-5 py-3">渠道</th><th className="px-5 py-3">金额</th><th className="px-5 py-3">状态</th><th className="px-5 py-3">创建时间</th><th className="px-5 py-3">支付时间</th></tr></thead><tbody className="divide-y divide-[var(--line)]">{orders.map((order) => <tr key={order.id}><td className="mono px-5 py-4">{order.orderNo}</td><td className="px-5 py-4"><strong className="block">{paymentChannelNames[order.channel]}</strong>{order.channel === "EPAY" && <small className="text-[8px] text-[var(--muted)]">{order.providerName ?? "历史服务商"}{order.paymentType ? ` · ${epayPaymentTypeNames[order.paymentType as EpayPaymentType] ?? order.paymentType}` : ""}</small>}</td><td className="px-5 py-4">¥{order.amount}</td><td className="px-5 py-4">{statusNames[order.status] ?? order.status}</td><td className="px-5 py-4">{new Date(order.createdAt).toLocaleString("zh-CN")}</td><td className="px-5 py-4">{order.paidAt ? new Date(order.paidAt).toLocaleString("zh-CN") : "-"}</td></tr>)}</tbody></table></div>
    {!orders.length && <div className="py-12 text-center text-[10px] text-[var(--muted)]">暂无账单支付订单</div>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-md p-0"><form onSubmit={create}><DialogHeader><DialogTitle>支付已出账账单</DialogTitle><DialogDescription>选择账单与支付渠道创建正式订单。</DialogDescription></DialogHeader><DialogBody className="space-y-4"><label className="block"><span className="mb-1.5 block text-[10px] font-semibold">账单</span><Select name="invoiceId" defaultValue={invoices[0]?.id}><SelectTrigger><SelectValue placeholder="选择账单" /></SelectTrigger><SelectContent>{invoices.map((invoice) => <SelectItem key={invoice.id} value={invoice.id}>{invoice.period} · ¥{invoice.amount}</SelectItem>)}</SelectContent></Select></label><PaymentMethodSelector channels={channels} paymentProviders={paymentProviders} />{error && <p role="alert" className="rounded-[var(--radius-control)] bg-[var(--danger-soft)] p-3 text-[10px] text-[var(--danger)]">{error}</p>}<Button disabled={saving} className="w-full">{saving ? <Loader2 className="animate-spin" /> : <CreditCard />}{saving ? "正在创建订单" : "确认支付"}</Button></DialogBody></form></DialogContent></Dialog>
    <Dialog open={Boolean(result)} onOpenChange={(next) => { if (!next) setResult(null); }}><DialogContent className="max-w-md p-0"><DialogHeader><DialogTitle>{result?.channel === "CODE_PAY" ? "扫码支付" : result?.channel === "WECHAT" ? "微信扫码支付" : "支付订单信息"}</DialogTitle></DialogHeader><DialogBody>{result && <PaymentResultView result={result} onCopy={copyOrderNo} copied={copied} />}</DialogBody></DialogContent></Dialog>
  </section>;
}

function PaymentResultView({ result, onCopy, copied }: { result: PaymentResult; onCopy: () => void; copied: boolean }) {
  if (result.channel === "WECHAT" && result.paymentUrl) return <div className="text-center"><QRCodeSVG value={result.paymentUrl} size={220} className="mx-auto rounded-[var(--radius-control)] bg-white p-3" /><p className="mt-3 text-[10px] text-[var(--muted)]">订单 {result.orderNo} · ¥{result.amount}</p></div>;
  if (result.channel === "BANK_TRANSFER") return <div className="space-y-3"><Landmark className="size-5 text-[var(--brand)]" /><Bank label="账户名称" value={String(result.bank?.accountName ?? "未配置")} /><Bank label="开户银行" value={String(result.bank?.bankName ?? "未配置")} /><Bank label="银行账号" value={String(result.bank?.accountNumber ?? "未配置")} /><Bank label="附言/备注" value={result.orderNo} /><CopyButton copied={copied} onCopy={onCopy} /></div>;
  if (result.channel === "CODE_PAY") { const config = result.codePay ?? {}; const qrImageUrl = typeof config.qrImageUrl === "string" ? config.qrImageUrl : ""; return <div className="space-y-4 text-center">{qrImageUrl ? <img src={qrImageUrl} alt="收款码" className="mx-auto max-h-64 w-auto rounded-[var(--radius-control)] border border-[var(--line)] bg-white p-2" /> /* eslint-disable-line @next/next/no-img-element */ : result.paymentUrl ? <QRCodeSVG value={result.paymentUrl} size={220} className="mx-auto rounded-[var(--radius-control)] bg-white p-3" /> : <QrCode className="mx-auto size-12 text-[var(--muted)]" />}{result.paymentUrl && <Button asChild variant="secondary" className="w-full"><a href={result.paymentUrl} target="_blank" rel="noreferrer">打开支付链接<ExternalLink /></a></Button>}<CopyButton copied={copied} onCopy={onCopy} /></div>; }
  return <div className="space-y-3"><p className="text-[11px]">订单号：<strong className="mono">{result.orderNo}</strong></p><CopyButton copied={copied} onCopy={onCopy} /></div>;
}

function CopyButton({ copied, onCopy }: { copied: boolean; onCopy: () => void }) { return <Button type="button" variant="secondary" className="w-full" onClick={onCopy}>{copied ? <Check /> : <Copy />}{copied ? "已复制" : "复制订单号"}</Button>; }
function Bank({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-4 rounded-[var(--radius-control)] bg-[var(--surface-subtle)] p-3 text-[10px]"><span className="text-[var(--muted)]">{label}</span><strong className="text-right">{value}</strong></div>; }
