import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { QqEmailBindingForm } from "@/components/qq-email-binding-form";

export const metadata: Metadata = { title: "绑定 QQ 登录邮箱" };

export default async function QqEmailBindingPage({ searchParams }: PageProps<"/auth/oauth/qq/bind">) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  return <AuthShell title="绑定真实邮箱" description="QQ 登录需要先验证一个你可以接收邮件的真实邮箱，验证完成后才会建立平台会话。">
    {token ? <QqEmailBindingForm token={token} /> : <div className="space-y-4"><p className="text-sm leading-6 text-[var(--muted)]">QQ 登录链接无效，请返回登录页重新开始。</p><Link href="/login" className="flex h-11 w-full items-center justify-center rounded-[var(--radius-control)] bg-[var(--brand)] text-sm font-semibold text-white">返回登录</Link></div>}
  </AuthShell>;
}
