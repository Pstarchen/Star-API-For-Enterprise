"use client";

import Link from "next/link";
import { CheckCircle2, Loader2, MailWarning } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { FormField, FormLabel, FormMessage } from "./ui/form-field";
import { Input } from "./ui/input";

export function EmailVerificationComplete() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const started = useRef(false);
  const initialEmail = searchParams.get("email") ?? "";
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">(token ? "loading" : "idle");
  const [message, setMessage] = useState(token ? "正在验证邮箱..." : "");

  const verify = useCallback(async (payload: { token: string } | { email: string; code: string }) => {
    setState("loading"); setMessage("正在验证邮箱...");
    try {
      const response = await fetch("/api/v1/auth/email/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setState("error"); setMessage(body.message ?? "邮箱验证失败"); return; }
      setState("success"); setMessage("邮箱验证成功，正在进入控制台...");
      window.setTimeout(() => window.location.replace(body.data?.user?.platformRole === "ADMIN" ? "/admin" : "/console"), 800);
    } catch {
      setState("error"); setMessage("无法连接邮箱验证服务");
    }
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!token) return;
    const timer = window.setTimeout(() => { void verify({ token }); }, 0);
    return () => window.clearTimeout(timer);
  }, [token, verify]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await verify({ email: String(form.get("email") ?? ""), code: String(form.get("code") ?? "") });
  }

  if (!token && state !== "success") return <form onSubmit={submit} className="space-y-4 text-left">
    <FormField><FormLabel>邮箱</FormLabel><Input name="email" type="email" required defaultValue={initialEmail} autoComplete="email" placeholder="name@example.com" /></FormField>
    <FormField><FormLabel>6 位验证码</FormLabel><Input name="code" required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" placeholder="000000" className="mono text-center text-lg tracking-[0.35em]" /></FormField>
    {message && state === "error" && <FormMessage>{message}</FormMessage>}
    <Button disabled={state === "loading"} className="w-full">{state === "loading" && <Loader2 className="animate-spin" />}{state === "loading" ? "正在验证" : "验证并登录"}</Button>
    <Button asChild variant="ghost" className="w-full"><Link href="/login">返回登录</Link></Button>
  </form>;

  return <div className="space-y-4 text-center"><span className={`mx-auto grid size-12 place-items-center rounded-[var(--radius-panel)] ${state === "success" ? "bg-[var(--success-soft)] text-[var(--success)]" : state === "error" ? "bg-[var(--danger-soft)] text-[var(--danger)]" : "bg-[var(--brand-soft)] text-[var(--brand)]"}`}>{state === "loading" ? <Loader2 className="size-5 animate-spin" /> : state === "success" ? <CheckCircle2 className="size-5" /> : <MailWarning className="size-5" />}</span><p className="text-[13px] text-[var(--muted)]">{message}</p>{state === "error" && <Button asChild variant="secondary"><Link href="/login">返回登录</Link></Button>}</div>;
}
