"use client";

import { Check, Copy, CreditCard, ExternalLink, Loader2, QrCode, WalletCards } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { type FormEvent, useState } from "react";
import { epayPaymentTypeNames, paymentChannelNames, type EpayPaymentType, type PaymentChannelValue, type PaymentProviderOption } from "@/lib/payment-options";
import { PaymentMethodSelector, type DirectPaymentChannel } from "./payment-method-selector";
import { Button } from "./ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";

type Order = { id: string; orderNo: string; channel: PaymentChannelValue; providerName: string | null; paymentType: string | null; status: string; amount: string; createdAt: string; paidAt: string | null };
type Entry = { id: string; type: string; delta: string; balanceAfter: string; reason: string; createdAt: string };
type Result = { orderNo: string; channel: PaymentChannelValue; amount: string; paymentUrl: string | null; paymentQrCode: string | null; paymentScheme: string | null; providerName: string | null; paymentType: string | null; bank: Record<string, unknown> | null; codePay: Record<string, unknown> | null };
const statusNames: Record<string, string> = { PENDING: "待确认", PAID: "已完成", CANCELED: "已取消", EXPIRED: "已过期", REFUNDED: "已退款" };

export function WalletRechargeManager({ balance, entries: initialEntries, orders: initialOrders, channels, paymentProviders }: { balance: string; entries: Entry[]; orders: Order[]; channels: DirectPaymentChannel[]; paymentProviders: readonly PaymentProviderOption[] }) {
  const [orders, setOrders] = useState(initialOrders);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const available = channels.some((item) => item.enabled && item.configured) || paymentProviders.length > 0;

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    const form = new FormData(event.currentTarget);
    const channel = String(form.get("channel"));
    try {
      const response = await fetch("/api/v1/payments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderType: "RECHARGE", amount: form.get("amount"), channel, ...(channel === "EPAY" ? { paymentProviderId: form.get("paymentProviderId"), paymentType: form.get("paymentType") } : {}) }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setError(body.message ?? "充值订单创建失败"); return; }
      const payment = body.data as Result;
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
    <div className="flex flex-col gap-3 border-b border-[var(--line)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-[var(--radius-control)] bg-[var(--brand-soft)] text-[var(--brand)]"><WalletCards className="size-5" /></span><div><h3 className="text-[13px] font-bold">账户余额</h3><p className="mt-1 text-[9px] text-[var(--muted)]">余额可用于平台内服务消费，充值到账以支付渠道确认结果为准。</p></div></div><div className="flex items-center gap-3"><strong className="text-xl">¥{balance}</strong><Button size="sm" onClick={() => { setOpen(true); setError(""); }} disabled={!available}><CreditCard />充值</Button></div></div>
    <div className="grid gap-5 p-5 lg:grid-cols-[1.15fr_.85fr]"><div><div className="flex items-center justify-between"><h4 className="text-[11px] font-bold">充值订单</h4><span className="text-[9px] text-[var(--muted)]">{orders.length} 条</span></div><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[680px] text-left text-[10px]"><thead className="text-[var(--muted)]"><tr><th className="pb-2">订单号</th><th className="pb-2">渠道</th><th className="pb-2">金额</th><th className="pb-2">状态</th><th className="pb-2">创建时间</th></tr></thead><tbody className="divide-y divide-[var(--line)]">{orders.map((order) => <tr key={order.id}><td className="mono py-3">{order.orderNo}</td><td className="py-3"><strong className="block">{paymentChannelNames[order.channel]}</strong>{order.channel === "EPAY" && <small className="text-[8px] text-[var(--muted)]">{order.providerName ?? "历史服务商"}{order.paymentType ? ` · ${epayPaymentTypeNames[order.paymentType as EpayPaymentType] ?? order.paymentType}` : ""}</small>}</td><td className="py-3">¥{order.amount}</td><td className="py-3">{statusNames[order.status] ?? order.status}</td><td className="py-3 text-[var(--muted)]">{new Date(order.createdAt).toLocaleString("zh-CN")}</td></tr>)}</tbody></table></div>{!orders.length && <div className="grid min-h-32 place-items-center text-[10px] text-[var(--muted)]">暂无充值订单</div>}</div><div><h4 className="text-[11px] font-bold">余额流水</h4><div className="mt-3 space-y-2">{initialEntries.map((entry) => <div key={entry.id} className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] bg-[var(--surface-subtle)] px-3 py-2.5 text-[10px]"><span className="min-w-0"><strong className="block truncate">{entry.reason}</strong><small className="text-[9px] text-[var(--muted)]">{new Date(entry.createdAt).toLocaleString("zh-CN")}</small></span><span className={Number(entry.delta) >= 0 ? "shrink-0 font-semibold text-[var(--success)]" : "shrink-0 font-semibold text-[var(--danger)]"}>{Number(entry.delta) >= 0 ? "+" : ""}¥{entry.delta}</span></div>)}{!initialEntries.length && <div className="grid min-h-32 place-items-center text-[10px] text-[var(--muted)]">暂无余额流水</div>}</div></div></div>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-md p-0"><form onSubmit={create}><DialogHeader><DialogTitle>余额充值</DialogTitle><DialogDescription>选择真实收款渠道创建充值订单。</DialogDescription></DialogHeader><DialogBody className="space-y-4"><label className="block"><span className="mb-1.5 block text-[10px] font-semibold">充值金额</span><Input name="amount" required type="number" min="0.01" max="100000000" step="0.01" placeholder="请输入金额" autoFocus /></label><PaymentMethodSelector channels={channels} paymentProviders={paymentProviders} />{error && <p role="alert" className="rounded-[var(--radius-control)] bg-[var(--danger-soft)] px-3 py-2 text-[10px] text-[var(--danger)]">{error}</p>}<Button disabled={saving} className="w-full">{saving ? <Loader2 className="animate-spin" /> : <CreditCard />}{saving ? "正在创建订单" : "继续支付"}</Button></DialogBody></form></DialogContent></Dialog>
    <Dialog open={Boolean(result)} onOpenChange={(next) => { if (!next) setResult(null); }}><DialogContent className="max-w-md p-0"><DialogHeader><DialogTitle>{result?.channel === "CODE_PAY" ? "扫码充值" : result?.channel === "WECHAT" ? "微信扫码充值" : "充值订单信息"}</DialogTitle></DialogHeader><DialogBody>{result && <PaymentResult result={result} onCopy={copyOrderNo} copied={copied} />}</DialogBody></DialogContent></Dialog>
  </section>;
}

function PaymentResult({ result, onCopy, copied }: { result: Result; onCopy: () => void; copied: boolean }) {
  if ((result.channel === "WECHAT" && result.paymentUrl) || (result.channel === "EPAY" && result.paymentQrCode)) return <div className="space-y-3 text-center"><QRCodeSVG value={result.channel === "EPAY" ? result.paymentQrCode! : result.paymentUrl!} size={220} className="mx-auto rounded-[var(--radius-control)] bg-white p-3" /><p className="text-[10px] text-[var(--muted)]">订单 {result.orderNo} · ¥{result.amount}</p>{result.paymentScheme && <p className="break-all text-[9px] text-[var(--muted)]">小程序入口：{result.paymentScheme}</p>}</div>;
  if (result.channel === "EPAY" && result.paymentScheme) return <div className="space-y-3"><p className="break-all text-[10px]">小程序支付地址：<strong>{result.paymentScheme}</strong></p><CopyButton copied={copied} onCopy={onCopy} /></div>;
  if (result.channel === "BANK_TRANSFER") { const bank = result.bank ?? {}; return <div className="space-y-3"><InfoRow label="账户名称" value={String(bank.accountName ?? "未配置")} /><InfoRow label="开户银行" value={String(bank.bankName ?? "未配置")} /><InfoRow label="银行账号" value={String(bank.accountNumber ?? "未配置")} /><InfoRow label="附言/备注" value={result.orderNo} /><CopyButton copied={copied} onCopy={onCopy} /></div>; }
  if (result.channel === "CODE_PAY") { const config = result.codePay ?? {}; const qrImageUrl = typeof config.qrImageUrl === "string" ? config.qrImageUrl : ""; return <div className="space-y-4 text-center">{qrImageUrl ? <img src={qrImageUrl} alt="收款码" className="mx-auto max-h-64 w-auto rounded-[var(--radius-control)] border border-[var(--line)] bg-white p-2" /> /* eslint-disable-line @next/next/no-img-element */ : result.paymentUrl ? <QRCodeSVG value={result.paymentUrl} size={220} className="mx-auto rounded-[var(--radius-control)] bg-white p-3" /> : <QrCode className="mx-auto size-12 text-[var(--muted)]" />}{result.paymentUrl && <Button asChild variant="secondary" className="w-full"><a href={result.paymentUrl} target="_blank" rel="noreferrer">打开支付链接<ExternalLink /></a></Button>}<CopyButton copied={copied} onCopy={onCopy} /></div>; }
  return <div className="space-y-3"><p className="text-[11px]">订单号：<strong className="mono">{result.orderNo}</strong></p><CopyButton copied={copied} onCopy={onCopy} /></div>;
}

function CopyButton({ copied, onCopy }: { copied: boolean; onCopy: () => void }) { return <Button type="button" variant="secondary" className="w-full" onClick={onCopy}>{copied ? <Check /> : <Copy />}{copied ? "已复制" : "复制订单号"}</Button>; }
function InfoRow({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-4 rounded-[var(--radius-control)] bg-[var(--surface-subtle)] p-3 text-[10px]"><span className="text-[var(--muted)]">{label}</span><strong className="text-right">{value}</strong></div>; }
