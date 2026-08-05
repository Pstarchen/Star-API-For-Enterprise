"use client";

import Link from "next/link";
import { Building2, CheckCircle2, Eye, EyeOff, Loader2, UserRound } from "lucide-react";
import { FormEvent, useState } from "react";
import { cn } from "@/lib/utils";

type AccountType = "personal" | "enterprise";

export function RegistrationForm() {
  const [accountType, setAccountType] = useState<AccountType>("personal");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ workspace: string; nextStep: string } | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true); setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/v1/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountType, name: form.get("name"), email: form.get("email"), password: form.get("password"), companyName: form.get("companyName") || undefined, acceptedTerms: form.get("acceptedTerms") === "on" }) });
    const result = await response.json();
    setLoading(false);
    if (!response.ok) { setError(result.message ?? "注册信息无法提交"); return; }
    setSuccess({ workspace: result.data.workspace.name, nextStep: result.data.nextStep });
  }

  if (success) return <div className="border border-[#b9ddcf] bg-[var(--brand-soft)] p-6"><CheckCircle2 className="size-8 text-[var(--brand)]" /><h2 className="mt-5 text-lg font-bold">账号创建成功</h2><p className="mt-2 text-[11px] leading-5 text-[var(--muted)]">工作区“{success.workspace}”已准备完成。{success.nextStep === "VERIFY_ENTERPRISE" ? "完成企业认证后即可申请生产配额。" : "现在可以创建第一枚 API Key。"}</p><Link href="/console" className="mt-6 inline-flex h-10 items-center rounded-[4px] bg-[var(--brand)] px-4 text-[11px] font-semibold text-white">进入控制台</Link></div>;

  return <form onSubmit={handleSubmit} className="space-y-4">
    <div className="grid grid-cols-2 gap-2 rounded-[6px] bg-[var(--surface-subtle)] p-1" role="tablist" aria-label="账号类型">
      <button type="button" onClick={() => setAccountType("personal")} className={cn("flex h-11 items-center justify-center gap-2 rounded-[4px] text-[11px] font-semibold text-[var(--muted)]", accountType === "personal" && "bg-white text-[var(--ink)] shadow-sm")} role="tab" aria-selected={accountType === "personal"}><UserRound className="size-4" />个人用户</button>
      <button type="button" onClick={() => setAccountType("enterprise")} className={cn("flex h-11 items-center justify-center gap-2 rounded-[4px] text-[11px] font-semibold text-[var(--muted)]", accountType === "enterprise" && "bg-white text-[var(--ink)] shadow-sm")} role="tab" aria-selected={accountType === "enterprise"}><Building2 className="size-4" />企业用户</button>
    </div>
    <label className="block"><span className="mb-1.5 block text-[10px] font-semibold">姓名</span><input name="name" required minLength={2} autoComplete="name" placeholder="你的姓名" className="h-11 w-full border border-[var(--line)] px-3 text-[12px] outline-none focus:border-[var(--brand)]" /></label>
    {accountType === "enterprise" && <label className="block"><span className="mb-1.5 block text-[10px] font-semibold">企业名称</span><input name="companyName" required autoComplete="organization" placeholder="企业工商登记全称" className="h-11 w-full border border-[var(--line)] px-3 text-[12px] outline-none focus:border-[var(--brand)]" /></label>}
    <label className="block"><span className="mb-1.5 block text-[10px] font-semibold">邮箱</span><input name="email" required type="email" autoComplete="email" placeholder="name@example.com" className="h-11 w-full border border-[var(--line)] px-3 text-[12px] outline-none focus:border-[var(--brand)]" /></label>
    <label className="block"><span className="mb-1.5 block text-[10px] font-semibold">密码</span><span className="flex h-11 items-center border border-[var(--line)] focus-within:border-[var(--brand)]"><input name="password" required minLength={8} type={showPassword ? "text" : "password"} autoComplete="new-password" placeholder="至少 8 个字符" className="min-w-0 flex-1 px-3 text-[12px] outline-none" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="grid size-10 place-items-center text-[var(--muted)]" aria-label={showPassword ? "隐藏密码" : "显示密码"}>{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></span></label>
    <label className="flex items-start gap-2 text-[10px] leading-5 text-[var(--muted)]"><input name="acceptedTerms" required type="checkbox" className="mt-1 size-3.5 accent-[var(--brand)]" />我已阅读并同意服务协议和隐私政策</label>
    {error && <p role="alert" className="rounded-[4px] bg-[var(--danger-soft)] px-3 py-2 text-[10px] text-[var(--danger)]">{error}</p>}
    <button type="submit" disabled={loading} className="flex h-11 w-full items-center justify-center gap-2 rounded-[4px] bg-[var(--brand)] text-[11px] font-semibold text-white hover:bg-[var(--brand-strong)] disabled:opacity-60">{loading && <Loader2 className="size-4 animate-spin" />}{loading ? "正在创建账号" : accountType === "enterprise" ? "创建企业账号" : "创建个人账号"}</button>
    <p className="text-center text-[10px] text-[var(--muted)]">已有账号？ <Link href="/login" className="font-semibold text-[var(--brand)]">登录</Link></p>
  </form>;
}
