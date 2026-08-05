import Link from "next/link";
import { ArrowRight, Building2, CircleGauge, Code2, Network, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { ApiMarketplace } from "@/components/api-marketplace";
import { PortalShell } from "@/components/portal-shell";
import { connection } from "next/server";
import { getPlatformConfig } from "@/lib/server/installation";

const metrics = [
  { value: "1,286", label: "注册开发者", detail: "个人与企业用户", icon: UserRound },
  { value: "12.8 亿", label: "累计稳定调用", detail: "+18.6% 本月", icon: Network },
  { value: "99.99%", label: "平台整体可用性", detail: "过去 90 天", icon: ShieldCheck },
  { value: "48 ms", label: "边缘节点 P50", detail: "国内 12 节点", icon: CircleGauge },
];

export default async function Home() {
  await connection();
  const platform = await getPlatformConfig();
  return <PortalShell>
    <section className="anime-hero min-h-[570px] border-b border-[var(--line)]">
      <div className="container-shell grid min-h-[570px] items-end pb-10 pt-44 sm:items-center sm:py-14 lg:grid-cols-2">
        <div className="hidden lg:block" aria-hidden="true" />
        <div className="lg:pl-12">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-[var(--brand)]"><Sparkles className="size-3.5 text-[var(--accent)]" />面向个人开发者与企业团队</div>
          <h1 className="text-balance mt-4 max-w-2xl text-[34px] font-bold leading-[1.18] text-[var(--ink)] sm:text-[44px]">{platform.name}</h1>
          <p className="mt-4 max-w-xl text-[14px] leading-7 text-[var(--muted)]">{platform.description}</p>
          <div className="mt-7 flex flex-wrap items-center gap-3"><Link href="/register" className="luminous-button inline-flex h-11 items-center gap-2 rounded-[6px] bg-[var(--brand)] px-5 text-[12px] font-semibold text-white hover:bg-[var(--brand-strong)]">免费注册 <ArrowRight className="size-3.5" /></Link><Link href="/marketplace" className="inline-flex h-11 items-center gap-2 rounded-[6px] border border-[var(--line-strong)] bg-[var(--surface-glass)] px-5 text-[12px] font-semibold shadow-sm backdrop-blur-md hover:bg-[var(--surface)]"><Code2 className="size-3.5" /> 浏览 API</Link></div>
          <div className="mt-8 grid max-w-xl grid-cols-3 gap-2">
            <div className="liquid-glass liquid-stat rounded-[7px] p-3"><span className="mono text-[8px] text-white/45">RESPONSE</span><strong className="mt-1 block text-sm">48 ms</strong></div>
            <div className="liquid-glass liquid-stat rounded-[7px] p-3"><span className="mono text-[8px] text-white/45">UPTIME</span><strong className="mt-1 block text-sm">99.99%</strong></div>
            <div className="liquid-glass liquid-stat rounded-[7px] p-3"><span className="mono flex items-center gap-1.5 text-[8px] text-white/45"><span className="live-signal size-1.5 rounded-full bg-[#51d5a9]" />STATUS</span><strong className="mt-1 block text-sm text-[#85dfc6]">运行正常</strong></div>
          </div>
        </div>
      </div>
    </section>

    <section className="border-b border-[var(--line)] bg-[var(--surface)]"><div className="container-shell grid grid-cols-2 divide-x divide-y divide-[var(--line)] sm:grid-cols-4 sm:divide-y-0">{metrics.map((metric) => <div key={metric.label} className="flex min-h-28 items-center gap-3 px-3 py-5 transition-colors hover:bg-[var(--surface-subtle)] sm:px-5"><metric.icon className="hidden size-5 text-[var(--aqua)] xl:block" /><div><strong className="block text-xl font-bold">{metric.value}</strong><span className="mt-1 block text-[11px] text-[var(--muted)]">{metric.label}</span><span className="mt-0.5 block text-[9px] text-[var(--brand)]">{metric.detail}</span></div></div>)}</div></section>

    <section className="border-b border-[var(--line)] bg-[var(--surface)]"><div className="container-shell grid lg:grid-cols-2"><div className="flex gap-4 border-b border-[var(--line)] py-7 lg:border-b-0 lg:border-r lg:pr-10"><span className="grid size-10 shrink-0 place-items-center rounded-[5px] bg-[var(--accent-soft)]"><UserRound className="size-5 text-[var(--accent)]" /></span><div><p className="eyebrow">PERSONAL</p><h2 className="mt-1 text-[15px] font-bold">个人开发者</h2><p className="mt-2 text-[11px] leading-5 text-[var(--muted)]">免费额度、独立密钥、按量充值，适合学习、开源项目与个人产品。</p><Link href="/pricing" className="mt-3 inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--brand)]">查看个人方案 <ArrowRight className="size-3" /></Link></div></div><div className="flex gap-4 py-7 lg:pl-10"><span className="grid size-10 shrink-0 place-items-center rounded-[5px] bg-[var(--brand-soft)]"><Building2 className="size-5 text-[var(--brand)]" /></span><div><p className="eyebrow">ENTERPRISE</p><h2 className="mt-1 text-[15px] font-bold">企业团队</h2><p className="mt-2 text-[11px] leading-5 text-[var(--muted)]">组织成员、角色权限、生产配额、合同发票与完整审计集中管理。</p><Link href="/pricing" className="mt-3 inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--brand)]">查看企业方案 <ArrowRight className="size-3" /></Link></div></div></div></section>

    <ApiMarketplace />
    <footer className="border-t border-[var(--line)] bg-[var(--surface)] py-8"><div className="container-shell flex flex-col gap-3 text-[11px] text-[var(--muted)] sm:flex-row sm:items-center sm:justify-between"><span>© 2026 {platform.name} · API 开放分发平台</span><div className="flex gap-5"><Link href="/pricing">价格方案</Link><Link href="/docs">接入文档</Link><Link href="/admin">平台管理</Link></div></div></footer>
  </PortalShell>;
}
