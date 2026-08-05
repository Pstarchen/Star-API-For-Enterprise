"use client";

import Link from "next/link";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter(); const [showPassword, setShowPassword] = useState(false); const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setLoading(true); await new Promise((resolve) => setTimeout(resolve, 500)); router.push("/console"); }
  return <form onSubmit={submit} className="space-y-4"><label className="block"><span className="mb-1.5 block text-[10px] font-semibold">邮箱</span><input required type="email" autoComplete="email" placeholder="name@example.com" className="h-11 w-full border border-[var(--line)] px-3 text-[12px] outline-none focus:border-[var(--brand)]" /></label><label className="block"><span className="mb-1.5 flex items-center justify-between text-[10px] font-semibold"><span>密码</span><button type="button" className="font-medium text-[var(--brand)]">忘记密码</button></span><span className="flex h-11 items-center border border-[var(--line)] focus-within:border-[var(--brand)]"><input required minLength={8} type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="输入密码" className="min-w-0 flex-1 px-3 text-[12px] outline-none" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="grid size-10 place-items-center text-[var(--muted)]" aria-label={showPassword ? "隐藏密码" : "显示密码"}>{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></span></label><label className="flex items-center gap-2 text-[10px] text-[var(--muted)]"><input type="checkbox" className="size-3.5 accent-[var(--brand)]" />保持登录</label><button disabled={loading} className="flex h-11 w-full items-center justify-center gap-2 rounded-[4px] bg-[var(--brand)] text-[11px] font-semibold text-white disabled:opacity-60">{loading && <Loader2 className="size-4 animate-spin" />}{loading ? "正在登录" : "登录"}</button><p className="text-center text-[10px] text-[var(--muted)]">还没有账号？ <Link href="/register" className="font-semibold text-[var(--brand)]">免费注册</Link></p></form>;
}
