import Link from "next/link";
import { ArrowRight, Building2, CircleGauge, Code2, Network, ShieldCheck, UserRound } from "lucide-react";
import { ApiMarketplace } from "@/components/api-marketplace";
import { PortalShell } from "@/components/portal-shell";

const metrics = [
  { value: "1,286", label: "注册开发者", detail: "个人与企业用户", icon: UserRound },
  { value: "12.8 亿", label: "累计稳定调用", detail: "+18.6% 本月", icon: Network },
  { value: "99.99%", label: "平台整体可用性", detail: "过去 90 天", icon: ShieldCheck },
  { value: "48 ms", label: "边缘节点 P50", detail: "国内 12 节点", icon: CircleGauge },
];

export default function Home() {
  return <PortalShell>
    <section className="border-b border-[var(--line)] bg-white">
      <div className="container-shell grid min-h-[330px] items-stretch lg:grid-cols-[1.15fr_.85fr]">
        <div className="flex flex-col justify-center py-12 pr-0 lg:border-r lg:border-[var(--line)] lg:pr-14">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-[var(--brand)]"><span className="size-1.5 rounded-full bg-[var(--brand)]" />面向个人开发者与企业团队</div>
          <h1 className="text-balance mt-5 max-w-2xl text-[36px] font-bold leading-[1.2] text-[var(--ink)] sm:text-[44px]">一套 API 平台，从个人项目到<span className="text-[var(--brand)]">企业生产</span></h1>
          <p className="mt-5 max-w-xl text-[15px] leading-7 text-[var(--muted)]">免费发现和调试接口，用统一密钥完成调用；项目进入生产后，继续获得组织权限、配额、账单和审计。</p>
          <div className="mt-7 flex flex-wrap items-center gap-3"><Link href="/register" className="inline-flex h-10 items-center gap-2 rounded-[5px] bg-[var(--brand)] px-4 text-[12px] font-semibold text-white hover:bg-[var(--brand-strong)]">免费注册 <ArrowRight className="size-3.5" /></Link><a href="#market-heading" className="inline-flex h-10 items-center gap-2 rounded-[5px] border border-[var(--line-strong)] bg-white px-4 text-[12px] font-semibold hover:bg-[var(--surface-subtle)]"><Code2 className="size-3.5" /> 浏览 API</a></div>
        </div>
        <div className="hidden p-8 lg:flex lg:flex-col lg:justify-center">
          <div className="border border-[var(--line)] bg-[var(--canvas)] p-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-[var(--line)] pb-3"><span className="mono text-[10px] text-[var(--muted)]">QUICK TRY / NO KEY REQUIRED</span><span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-[var(--brand)]"><span className="size-1.5 rounded-full bg-[var(--brand)]" /> 200 OK</span></div>
            <div className="mono mt-4 space-y-2 text-[11px] leading-5"><p><span className="font-bold text-[#28609a]">GET</span> <span>/v1/network/ip?ip=1.1.1.1</span></p><p className="text-[var(--muted)]">x-request-id: req_91DSK24D</p><div className="mt-3 border-l-2 border-[var(--brand)] bg-white p-3 text-[var(--muted)]"><p>{`{`}</p><p className="pl-4">&quot;country&quot;: &quot;中国&quot;,</p><p className="pl-4">&quot;region&quot;: &quot;上海&quot;</p><p>{`}`}</p></div></div>
            <div className="mt-4 grid grid-cols-3 gap-px overflow-hidden border border-[var(--line)] bg-[var(--line)] text-center"><div className="bg-white py-3"><strong className="block text-sm">23ms</strong><span className="text-[9px] text-[var(--muted)]">LATENCY</span></div><div className="bg-white py-3"><strong className="block text-sm">免费</strong><span className="text-[9px] text-[var(--muted)]">ACCESS</span></div><div className="bg-white py-3"><strong className="block text-sm">TLS 1.3</strong><span className="text-[9px] text-[var(--muted)]">SECURITY</span></div></div>
          </div>
        </div>
      </div>
    </section>

    <section className="border-b border-[var(--line)] bg-[var(--surface-subtle)]"><div className="container-shell grid grid-cols-2 divide-x divide-y divide-[var(--line)] sm:grid-cols-4 sm:divide-y-0">{metrics.map((metric) => <div key={metric.label} className="flex min-h-28 items-center gap-3 px-3 py-5 sm:px-5"><metric.icon className="hidden size-5 text-[var(--brand)] xl:block" /><div><strong className="block text-xl font-bold">{metric.value}</strong><span className="mt-1 block text-[11px] text-[var(--muted)]">{metric.label}</span><span className="mt-0.5 block text-[9px] text-[var(--brand)]">{metric.detail}</span></div></div>)}</div></section>

    <section className="border-b border-[var(--line)] bg-white"><div className="container-shell grid lg:grid-cols-2"><div className="flex gap-4 border-b border-[var(--line)] py-7 lg:border-b-0 lg:border-r lg:pr-10"><span className="grid size-10 shrink-0 place-items-center rounded-[5px] bg-[var(--brand-soft)]"><UserRound className="size-5 text-[var(--brand)]" /></span><div><p className="eyebrow">PERSONAL</p><h2 className="mt-1 text-[15px] font-bold">个人开发者</h2><p className="mt-2 text-[11px] leading-5 text-[var(--muted)]">免费额度、独立密钥、按量充值，适合学习、开源项目与个人产品。</p><Link href="/pricing" className="mt-3 inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--brand)]">查看个人方案 <ArrowRight className="size-3" /></Link></div></div><div className="flex gap-4 py-7 lg:pl-10"><span className="grid size-10 shrink-0 place-items-center rounded-[5px] bg-[#e5f1ff]"><Building2 className="size-5 text-[#28609a]" /></span><div><p className="eyebrow">ENTERPRISE</p><h2 className="mt-1 text-[15px] font-bold">企业团队</h2><p className="mt-2 text-[11px] leading-5 text-[var(--muted)]">组织成员、角色权限、生产配额、合同发票与完整审计集中管理。</p><Link href="/pricing" className="mt-3 inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--brand)]">查看企业方案 <ArrowRight className="size-3" /></Link></div></div></div></section>

    <ApiMarketplace />
    <footer className="border-t border-[var(--line)] bg-white py-8"><div className="container-shell flex flex-col gap-3 text-[11px] text-[var(--muted)] sm:flex-row sm:items-center sm:justify-between"><span>© 2026 星枢 API · 公共接口服务平台</span><div className="flex gap-5"><Link href="/pricing">价格方案</Link><Link href="/docs">接入文档</Link><Link href="/admin">平台管理</Link></div></div></footer>
  </PortalShell>;
}
