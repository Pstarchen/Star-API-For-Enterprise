"use client";

import Link from "next/link";
import { ArrowLeft, CheckCircle2, ShieldCheck } from "lucide-react";
import { BrandMark } from "./brand-mark";
import { ThemeToggle } from "./theme-toggle";
import { useBranding } from "./branding-provider";
import { Button } from "./ui/button";

const trustItems = ["统一密钥访问全部 API", "个人与企业空间完全隔离", "调用、配额和费用实时可见"];

export function AuthShell({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  const branding = useBranding();
  return <main className="auth-scene min-h-[100dvh]">
    <aside className="auth-story">
      <div className="auth-story-brand"><BrandMark /></div>
      <div className="auth-story-copy"><p>IDENTITY / ACCESS / GOVERNANCE</p><h2>从第一次试用，到每一次生产调用</h2><div>{trustItems.map((item) => <span key={item}><CheckCircle2 />{item}</span>)}</div></div>
      <div className="auth-story-foot"><ShieldCheck />会话与凭据经过安全保护</div>
    </aside>
    <section className="auth-dock">
      <div className="auth-dock-top"><div className="lg:hidden"><BrandMark /></div><ThemeToggle className="ml-auto grid size-9 place-items-center rounded-[7px] text-[var(--muted)] transition hover:bg-[var(--surface-subtle)]" /><Button asChild variant="ghost" size="sm"><Link href="/"><ArrowLeft />返回 API 市场</Link></Button></div>
      <div className="auth-mobile-art lg:hidden" aria-hidden="true" />
      <div className="auth-form-area"><p className="eyebrow">STAR IDENTITY</p><h1>{title}</h1><p>{description}</p><div className="mt-7">{children}</div></div>
      <p className="auth-copyright">© 2026 {branding.name} · 服务协议 · 隐私政策</p>
    </section>
  </main>;
}
