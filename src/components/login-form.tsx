"use client";

import Link from "next/link";
import { Eye, EyeOff, GitBranch as Github, Loader2 } from "lucide-react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

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
};

export function LoginForm({ githubEnabled, oauthError }: { githubEnabled: boolean; oauthError?: string }) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
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
        if (result.data?.next === "/install") router.push("/install");
        return;
      }
      const requestedPath = new URL(window.location.href).searchParams.get("next");
      const fallback = result.data.user.platformRole === "ADMIN" ? "/admin" : "/console";
      router.push(requestedPath?.startsWith("/") && !requestedPath.startsWith("//") ? requestedPath : fallback);
      router.refresh();
    } catch {
      setError("无法连接登录服务，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  return <div className="space-y-4">{githubEnabled && <><Link href="/api/v1/auth/github" className="flex h-11 w-full items-center justify-center gap-2 rounded-[6px] border border-[var(--line-strong)] bg-[var(--surface)] text-[11px] font-semibold hover:bg-[var(--surface-subtle)]"><Github className="size-4" />使用 GitHub 登录</Link><div className="flex items-center gap-3 text-[9px] text-[var(--muted)]"><span className="h-px flex-1 bg-[var(--line)]" />或使用邮箱密码<span className="h-px flex-1 bg-[var(--line)]" /></div></>}<form onSubmit={submit} className="space-y-4"><label className="block"><span className="mb-1.5 block text-[10px] font-semibold">邮箱</span><input name="email" required type="email" autoComplete="email" placeholder="name@example.com" className="h-11 w-full rounded-[6px] border border-[var(--line)] px-3 text-[12px] outline-none focus:border-[var(--brand)]" /></label><label className="block"><span className="mb-1.5 block text-[10px] font-semibold">密码</span><span className="flex h-11 items-center rounded-[6px] border border-[var(--line)] focus-within:border-[var(--brand)]"><input name="password" required maxLength={72} type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="输入密码" className="min-w-0 flex-1 px-3 text-[12px] outline-none" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="grid size-10 place-items-center text-[var(--muted)]" aria-label={showPassword ? "隐藏密码" : "显示密码"}>{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></span></label><label className="flex items-center gap-2 text-[10px] text-[var(--muted)]"><input name="remember" type="checkbox" className="size-3.5 accent-[var(--brand)]" />保持登录 30 天</label>{(error || oauthError) && <p role="alert" className="rounded-[6px] bg-[var(--danger-soft)] px-3 py-2 text-[10px] text-[var(--danger)]">{error || oauthMessages[oauthError ?? ""] || "第三方登录失败"}</p>}<button type="submit" disabled={loading} className="flex h-11 w-full items-center justify-center gap-2 rounded-[6px] bg-[var(--brand)] text-[11px] font-semibold text-white disabled:opacity-60">{loading && <Loader2 className="size-4 animate-spin" />}{loading ? "正在登录" : "登录"}</button><p className="text-center text-[10px] text-[var(--muted)]">还没有账号？ <Link href="/register" className="font-semibold text-[var(--brand)]">免费注册</Link></p></form></div>;
}
