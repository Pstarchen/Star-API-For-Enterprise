"use client";

import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "./ui/button";
import { FormField, FormLabel, FormMessage } from "./ui/form-field";
import { Input } from "./ui/input";
import { PasswordField } from "./ui/password-field";

export function ForgotPasswordForm() {
  const [loading, setLoading] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setLoading(true); setMessage(""); setError(""); const form = new FormData(event.currentTarget); try { const response = await fetch("/api/v1/auth/password/forgot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: form.get("email") }) }); const result = await response.json(); if (!response.ok) setError(result.message ?? "请求失败"); else setMessage(result.message); } catch { setError("无法连接密码重置服务"); } finally { setLoading(false); } }
  return <form onSubmit={submit} className="space-y-4"><FormField><FormLabel>邮箱</FormLabel><Input name="email" type="email" required autoComplete="email" placeholder="name@example.com" /></FormField>{message && <p role="status" className="flex items-center gap-2 text-[11px] text-[var(--success)]"><CheckCircle2 className="size-4" />{message}</p>}{error && <FormMessage>{error}</FormMessage>}<Button disabled={loading} className="w-full">{loading && <Loader2 className="animate-spin" />}{loading ? "正在发送" : "发送重置邮件"}</Button><Button asChild variant="ghost" className="w-full"><Link href="/login">返回登录</Link></Button></form>;
}
export function ResetPasswordForm({ token }: { token: string }) {
  const [loading, setLoading] = useState(false); const [success, setSuccess] = useState(false); const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setLoading(true); setError(""); const form = new FormData(event.currentTarget); const password = String(form.get("password") ?? ""); if (password !== form.get("confirmPassword")) { setError("两次输入的密码不一致"); setLoading(false); return; } try { const response = await fetch("/api/v1/auth/password/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) }); const result = await response.json(); if (!response.ok) setError(result.message ?? "密码重置失败"); else setSuccess(true); } catch { setError("无法连接密码重置服务"); } finally { setLoading(false); } }
  if (success) return <div className="space-y-4 text-center"><CheckCircle2 className="mx-auto size-10 text-[var(--success)]" /><p className="text-[12px] text-[var(--muted)]">密码已重置，所有旧会话已退出。</p><Button asChild className="w-full"><Link href="/login">使用新密码登录</Link></Button></div>;
  return <form onSubmit={submit} className="space-y-4"><PasswordField label="新密码" name="password" required minLength={10} maxLength={72} autoComplete="new-password" placeholder="至少 10 位，包含字母和数字" /><PasswordField label="确认新密码" name="confirmPassword" required minLength={10} maxLength={72} autoComplete="new-password" />{error && <FormMessage>{error}</FormMessage>}<Button disabled={loading || !token} className="w-full">{loading && <Loader2 className="animate-spin" />}{loading ? "正在重置" : "重置密码"}</Button></form>;
}
