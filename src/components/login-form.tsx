"use client";

import Link from "next/link";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm() {
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

  return <form onSubmit={submit} className="space-y-4"><label className="block"><span className="mb-1.5 block text-[10px] font-semibold">邮箱</span><input name="email" required type="email" autoComplete="email" placeholder="name@example.com" className="h-11 w-full border border-[var(--line)] px-3 text-[12px] outline-none focus:border-[var(--brand)]" /></label><label className="block"><span className="mb-1.5 block text-[10px] font-semibold">密码</span><span className="flex h-11 items-center border border-[var(--line)] focus-within:border-[var(--brand)]"><input name="password" required maxLength={72} type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="输入密码" className="min-w-0 flex-1 px-3 text-[12px] outline-none" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="grid size-10 place-items-center text-[var(--muted)]" aria-label={showPassword ? "隐藏密码" : "显示密码"}>{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></span></label><label className="flex items-center gap-2 text-[10px] text-[var(--muted)]"><input name="remember" type="checkbox" className="size-3.5 accent-[var(--brand)]" />保持登录 30 天</label>{error && <p role="alert" className="rounded-[4px] bg-[var(--danger-soft)] px-3 py-2 text-[10px] text-[var(--danger)]">{error}</p>}<button type="submit" disabled={loading} className="flex h-11 w-full items-center justify-center gap-2 rounded-[4px] bg-[var(--brand)] text-[11px] font-semibold text-white disabled:opacity-60">{loading && <Loader2 className="size-4 animate-spin" />}{loading ? "正在登录" : "登录"}</button><p className="text-center text-[10px] text-[var(--muted)]">还没有账号？ <Link href="/register" className="font-semibold text-[var(--brand)]">免费注册</Link></p></form>;
}
