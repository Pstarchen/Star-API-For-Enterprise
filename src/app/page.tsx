import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Building2, CheckCircle2, CircleGauge, Code2, KeyRound, Network, Route, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { connection } from "next/server";
import { ApiMarketplace } from "@/components/api-marketplace";
import { PortalShell } from "@/components/portal-shell";
import { Button } from "@/components/ui/button";
import { platformHeroUrl } from "@/lib/platform";
import { listCatalogProducts } from "@/lib/server/catalog";
import { getPlatformConfig } from "@/lib/server/installation";
import { prisma } from "@/lib/server/prisma";

export default async function Home() {
  await connection();
  const [platform, products, users, publishedApis, calls, successes, latency] = await Promise.all([
    getPlatformConfig(), listCatalogProducts({ status: "PUBLISHED", limit: 6 }), prisma.user.count(), prisma.apiProduct.count({ where: { status: "PUBLISHED" } }), prisma.requestLog.count(), prisma.requestLog.count({ where: { statusCode: { gte: 200, lt: 400 } } }), prisma.requestLog.aggregate({ _avg: { latencyMs: true } }),
  ]);
  const successRate = calls ? `${((successes / calls) * 100).toFixed(2)}%` : "暂无";
  const averageLatency = latency._avg.latencyMs == null ? "暂无" : `${Math.round(latency._avg.latencyMs)} ms`;
  const publicSecurityCode = platform.publicSecurityNumber.match(/\d{8,}/)?.[0] ?? "";
  const metrics = [
    { value: users.toLocaleString("zh-CN"), label: "注册用户", note: "个人与企业账号", icon: UserRound },
    { value: calls.toLocaleString("zh-CN"), label: "累计调用", note: "真实网关请求", icon: Network },
    { value: successRate, label: "调用成功率", note: `平均响应 ${averageLatency}`, icon: ShieldCheck },
    { value: publishedApis.toLocaleString("zh-CN"), label: "开放 API", note: "当前已发布", icon: CircleGauge },
  ];

  return <PortalShell>
    <section className="home-hero">
      <Image src={platformHeroUrl(platform)} alt={`${platform.name} 首页视觉`} fill priority unoptimized className="home-hero-image" sizes="100vw" />
      <div className="container-shell home-hero-layout">
        <div className="home-hero-copy">
          <div className="home-kicker"><Sparkles />企业级 API 开放分发平台</div>
          <h1>{platform.name}</h1>
          <p>{platform.description}</p>
          <div className="home-hero-actions"><Button asChild size="lg"><Link href="/register">开始接入<ArrowRight /></Link></Button><Button asChild variant="secondary" size="lg" className="home-secondary-action"><Link href="/marketplace"><Code2 />浏览 API</Link></Button></div>
          <div className="home-route-line"><span><Route />统一网关</span><span><KeyRound />密钥鉴权</span><span><CircleGauge />计量计费</span></div>
        </div>
        <aside className="home-runtime" aria-label="实时网关概览">
          <header><span><i />网关服务在线</span><small>LIVE</small></header>
          <div className="home-runtime-route"><span>统一调用地址</span><code>/api/your-route</code></div>
          <div className="home-runtime-grid"><RuntimeMetric icon={Route} label="已发布 API" value={publishedApis.toLocaleString("zh-CN")} /><RuntimeMetric icon={CheckCircle2} label="调用成功率" value={successRate} /><RuntimeMetric icon={CircleGauge} label="平均响应" value={averageLatency} /></div>
          <Link href="/docs">查看接入文档<ArrowRight /></Link>
        </aside>
      </div>
    </section>

    <section className="home-metric-band"><div className="container-shell grid grid-cols-2 lg:grid-cols-4">{metrics.map((metric) => <div key={metric.label} className="home-metric"><metric.icon /><div><strong>{metric.value}</strong><span>{metric.label}</span><small>{metric.note}</small></div></div>)}</div></section>

    <section className="home-audience"><div className="container-shell"><header className="home-section-heading"><p className="eyebrow">ONE PLATFORM, TWO WORKFLOWS</p><h2>从个人接入到企业治理</h2><p>账号、应用、密钥、订阅和账单使用同一套真实业务链路。</p></header><div className="home-audience-grid">
      <Audience icon={UserRound} index="PERSONAL" title="个人开发者" text="从第一枚密钥到调用日志与按量计费，用一个工作区管理独立应用。" points={["应用与密钥隔离", "真实调用日志", "接口级订阅与费用"]} />
      <Audience icon={Building2} index="ENTERPRISE" title="企业团队" text="围绕组织、权限、账单和审计建立可追踪的 API 使用体系。" points={["成员与角色治理", "统一账单和配额", "操作与调用审计"]} enterprise />
    </div></div></section>

    <ApiMarketplace products={products} />
    <footer className="border-t border-[var(--line)] bg-[var(--surface)] py-8"><div className="container-shell flex flex-col gap-4 text-xs text-[var(--muted)] sm:flex-row sm:items-center sm:justify-between"><div className="space-y-1.5"><span className="block">© 2026 {platform.name} · API 开放分发平台</span>{(platform.icpNumber || platform.publicSecurityNumber) && <div className="flex flex-wrap gap-x-4 gap-y-1">{platform.icpNumber && <a href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer" className="hover:text-[var(--ink)]">{platform.icpNumber}</a>}{platform.publicSecurityNumber && <a href={publicSecurityCode ? `https://www.beian.gov.cn/portal/registerSystemInfo?recordcode=${publicSecurityCode}` : "https://www.beian.gov.cn/"} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-[var(--ink)]"><ShieldCheck className="size-3" />{platform.publicSecurityNumber}</a>}</div>}</div><div className="flex gap-5"><Link href="/pricing">接口价格</Link><Link href="/docs">接入文档</Link><Link href="/admin">平台管理</Link></div></div></footer>
  </PortalShell>;
}

function Audience({ icon: Icon, index, title, text, points, enterprise = false }: { icon: typeof UserRound; index: string; title: string; text: string; points: string[]; enterprise?: boolean }) {
  return <article className={`home-audience-item ${enterprise ? "is-enterprise" : ""}`}><div className="home-audience-heading"><span><Icon /></span><small>{index}</small></div><h2>{title}</h2><p>{text}</p><ul>{points.map((point) => <li key={point}><ShieldCheck />{point}</li>)}</ul><Link href="/register">创建{enterprise ? "企业" : "个人"}账号<ArrowRight /></Link></article>;
}

function RuntimeMetric({ icon: Icon, label, value }: { icon: typeof Route; label: string; value: string }) {
  return <div><Icon /><span>{label}</span><strong>{value}</strong></div>;
}
