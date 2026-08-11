"use client";

import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { BrandMark } from "./brand-mark";
import { ThemeToggle } from "./theme-toggle";
import { useBranding } from "./branding-provider";
import { Button } from "./ui/button";

export function AuthShell({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  const branding = useBranding();
  return <main className="auth-scene min-h-[100dvh]">
    <header className="auth-header"><BrandMark /><div><ThemeToggle className="grid size-9 place-items-center rounded-[7px] text-[var(--muted)] transition hover:bg-[var(--surface-subtle)]" /><Button asChild variant="ghost" size="sm"><Link href="/"><ArrowLeft />返回首页</Link></Button></div></header>
    <section className="auth-stage">
      <div className="auth-card">
        <div className="auth-card-heading"><span className="auth-card-mark"><ShieldCheck /></span><p className="eyebrow">STAR IDENTITY</p><h1>{title}</h1><p>{description}</p></div>
        <div className="auth-form-area">{children}</div>
        <div className="auth-security"><ShieldCheck />账号会话与 API 凭据分离保护</div>
      </div>
    </section>
    <p className="auth-copyright">© 2026 {branding.name} · 服务协议 · 隐私政策</p>
  </main>;
}
