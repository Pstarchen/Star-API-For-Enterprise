"use client";

import Link from "next/link";
import { Eye, EyeOff, GitBranch as Github, Loader2, MailCheck } from "lucide-react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { FormField, FormLabel, FormMessage } from "./ui/form-field";
import { Input, InputGroup } from "./ui/input";
import { GITHUB_OAUTH_START_PATH } from "@/lib/oauth";

const oauthMessages: Record<string, string> = {
  github_invalid_callback: "GitHub 回调参数不完整",
  github_invalid_state: "GitHub 登录请求已失效，请重新发起",
  github_not_configured: "GitHub 登录尚未完成配置",
  github_token_failed: "GitHub 授权交换失败",
  github_profile_failed: "无法读取 GitHub 账号信息",
  github_verified_email_required: "GitHub 账号需要至少一个已验证邮箱",
  account_suspended: "该账号已被冻结",
  github_account_conflict: "GitHub 账号绑定冲突，请联系管理员",
  github_login_failed: "GitHub 登录失败，请稍后重试",
  registration_disabled: "平台当前未开放新用户注册，该 GitHub 账号尚未绑定现有用户",
};

export function LoginForm({ passwordLoginEnabled, registrationEnabled, githubEnabled, oauthError, nextPath }: { passwordLoginEnabled: boolean; registrationEnabled: boolean; githubEnabled: boolean; oauthError?: string; nextPath?: string }) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [verificationEmail, setVerificationEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const requestedPath = nextPath?.startsWith("/") && !nextPath.startsWith("//") ? nextPath : undefined;
  const githubHref = requestedPath ? `${GITHUB_OAUTH_START_PATH}?next=${encodeURIComponent(requestedPath)}` : GITHUB_OAUTH_START_PATH;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setVerificationEmail("");
    setResendMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password"), remember: form.get("remember") === "on" }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.message ?? "无法登录");
        if (result.data?.emailVerificationRequired && typeof result.data.email === "string") setVerificationEmail(result.data.email);
        if (result.data?.next === "/install") router.push("/install");
        return;
      }
      const fallback = result.data.user.platformRole === "ADMIN" ? "/admin" : "/console";
      router.push(requestedPath ?? fallback);
      router.refresh();
    } catch {
      setError("无法连接登录服务，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  async function resendVerification() {
    if (!verificationEmail) return;
    setResending(true); setResendMessage("");
    const response = await fetch("/api/v1/auth/email/resend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: verificationEmail }) });
    const result = await response.json().catch(() => ({}));
    setResending(false);
    setResendMessage(result.message ?? (response.ok ? "验证邮件已发送" : "验证邮件发送失败"));
  }

  return <div className="space-y-4">
    {githubEnabled && <><Button asChild variant="secondary" size="lg" className="w-full"><Link href={githubHref}><Github />使用 GitHub 登录</Link></Button>{passwordLoginEnabled && <div className="flex items-center gap-3 text-xs text-[var(--muted)]"><span className="h-px flex-1 bg-[var(--line)]" />或使用邮箱密码<span className="h-px flex-1 bg-[var(--line)]" /></div>}</>}
    {passwordLoginEnabled && <form onSubmit={submit} className="space-y-4">
      <FormField><FormLabel>邮箱</FormLabel><Input name="email" required type="email" autoComplete="email" placeholder="name@example.com" className="h-11 text-[12px]" /></FormField>
      <FormField><FormLabel>密码</FormLabel><InputGroup className="h-11"><Input name="password" required maxLength={72} type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="输入密码" className="text-[12px]" /><Button type="button" variant="ghost" size="icon" onClick={() => setShowPassword((value) => !value)} className="mr-1 shrink-0" aria-label={showPassword ? "隐藏密码" : "显示密码"}>{showPassword ? <EyeOff /> : <Eye />}</Button></InputGroup></FormField>
      <div className="flex items-center justify-between gap-3"><label className="flex items-center gap-2 text-xs text-[var(--muted)]"><Checkbox name="remember" />保持登录 30 天</label><Link href="/forgot-password" className="text-xs font-semibold text-[var(--brand)]">忘记密码</Link></div>
      {(error || oauthError) && <FormMessage>{error || oauthMessages[oauthError ?? ""] || "第三方登录失败"}</FormMessage>}
      {verificationEmail && <div className="space-y-2 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface-subtle)] p-3"><p className="text-[10px] text-[var(--muted)]">邮箱尚未验证。验证码 10 分钟内有效，也可以重新发送到 {verificationEmail}。</p><div className="flex flex-wrap gap-2"><Button asChild type="button" size="sm"><Link href={`/verify-email?email=${encodeURIComponent(verificationEmail)}`}><MailCheck />输入验证码</Link></Button><Button type="button" variant="secondary" size="sm" onClick={resendVerification} disabled={resending}>{resending ? <Loader2 className="animate-spin" /> : <MailCheck />}{resending ? "正在发送" : "重新发送"}</Button></div>{resendMessage && <p className="text-[10px] text-[var(--muted)]">{resendMessage}</p>}</div>}
      <Button type="submit" size="lg" disabled={loading} className="w-full">{loading && <Loader2 className="animate-spin" />}{loading ? "正在登录" : "登录"}</Button>
      {registrationEnabled && <p className="text-center text-xs text-[var(--muted)]">还没有账号？ <Link href="/register" className="font-semibold text-[var(--brand)] hover:text-[var(--brand-strong)]">免费注册</Link></p>}
    </form>}
    {!passwordLoginEnabled && !githubEnabled && <FormMessage>平台暂时没有可用的登录方式，请联系管理员。</FormMessage>}
    {!passwordLoginEnabled && oauthError && <FormMessage>{oauthMessages[oauthError] || "第三方登录失败"}</FormMessage>}
  </div>;
}
