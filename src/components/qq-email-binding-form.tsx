"use client";

import Link from "next/link";
import { CheckCircle2, Loader2, Mail, Send, ShieldCheck } from "lucide-react";
import { FormEvent, useState } from "react";
import { Button } from "./ui/button";
import { FormField, FormHint, FormLabel, FormMessage } from "./ui/form-field";
import { Input } from "./ui/input";

export function QqEmailBindingForm({ token }: { token: string }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function sendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true); setError("");
    try {
      const response = await fetch("/api/v1/auth/oauth/qq/bind", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "send", token, email }) });
      const result = await response.json().catch(() => null);
      if (!response.ok) { setError(result?.message ?? "验证码发送失败，请稍后重试"); return; }
      setSent(true); setCode("");
    } catch {
      setError("无法连接邮箱验证服务，请稍后重试");
    } finally {
      setSending(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setVerifying(true); setError("");
    try {
      const response = await fetch("/api/v1/auth/oauth/qq/bind", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verify", token, email, code }) });
      const result = await response.json().catch(() => null);
      if (!response.ok) { setError(result?.message ?? "验证码校验失败，请检查后重试"); return; }
      const next = typeof result?.data?.next === "string" ? result.data.next : "/console";
      setSuccess(true);
      window.location.assign(next);
    } catch {
      setError("无法连接邮箱验证服务，请稍后重试");
    } finally {
      setVerifying(false);
    }
  }

  if (success) return <div className="space-y-4"><div className="flex items-center gap-3 rounded-[var(--radius-control)] border border-[var(--success-line)] bg-[var(--success-soft)] px-3 py-3 text-sm text-[var(--success)]"><CheckCircle2 className="size-5 shrink-0" />邮箱验证成功，正在进入平台。</div><Link href="/console" className="flex h-11 w-full items-center justify-center rounded-[var(--radius-control)] bg-[var(--brand)] text-sm font-semibold text-white">进入控制台</Link></div>;

  return <div className="space-y-4">
    <div className="flex items-start gap-3 rounded-[var(--radius-control)] border border-[var(--brand-line)] bg-[var(--brand-soft)] px-3 py-3 text-xs leading-5 text-[var(--brand-strong)]"><ShieldCheck className="mt-0.5 size-4 shrink-0" />验证码只用于确认邮箱归属，不会把 QQ 内部标识当作邮箱保存。</div>
    <form onSubmit={sendCode} className="space-y-4">
      <FormField><FormLabel>真实邮箱</FormLabel><div className="relative"><Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" /><Input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" className="h-11 pl-9 text-[12px]" /></div><FormHint>请填写你能正常接收邮件的地址。</FormHint></FormField>
      <Button type="submit" disabled={sending || verifying} size="lg" className="w-full">{sending ? <Loader2 className="animate-spin" /> : <Send />}{sending ? "正在发送" : sent ? "重新发送验证码" : "发送验证码"}</Button>
    </form>
    {sent && <form onSubmit={verifyCode} className="space-y-4 border-t border-[var(--line)] pt-4"><FormField><FormLabel>邮箱验证码</FormLabel><Input required inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="输入 6 位验证码" className="h-11 text-center text-[16px] tracking-[0.35em]" /><FormHint>验证码 10 分钟内有效。</FormHint></FormField><Button type="submit" disabled={verifying || sending || code.length !== 6} size="lg" className="w-full">{verifying ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}{verifying ? "正在验证" : "验证并登录"}</Button></form>}
    {error && <FormMessage>{error}</FormMessage>}
    <Link href="/login" className="flex h-10 w-full items-center justify-center rounded-[var(--radius-control)] border border-[var(--line)] text-xs font-semibold text-[var(--muted)] hover:bg-[var(--surface-subtle)]">返回登录</Link>
  </div>;
}
