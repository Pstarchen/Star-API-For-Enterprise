import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BadgeCheck, BookOpen, CircleGauge, Clock3, ExternalLink, KeyRound, ShieldCheck } from "lucide-react";
import { LocalTime } from "@/components/local-time";
import { PortalShell } from "@/components/portal-shell";
import { RequestPlayground } from "@/components/request-playground";
import { buildPublicApiUrl } from "@/lib/api-routes";
import { getCatalogProduct } from "@/lib/server/catalog";
import { getPlatformConfig } from "@/lib/server/installation";
import { cn, getMethodClass } from "@/lib/utils";

export async function generateMetadata({ params }: PageProps<"/apis/[slug]">): Promise<Metadata> {
  const api = await getCatalogProduct((await params).slug);
  return { title: api?.name ?? "API 详情", description: api?.description };
}

function sourceLabel(type: string) {
  if (type === "PUBLIC_API") return "公网转发";
  if (type === "SERVER_LOCAL") return "服务器内网";
  if (type === "TUNNEL") return "临时穿透";
  if (type === "PHP_PACKAGE") return "PHP 隔离运行";
  if (type === "CONTENT") return "平台内容服务";
  return "平台内置";
}

export default async function ApiDetailPage({ params }: PageProps<"/apis/[slug]">) {
  const api = await getCatalogProduct((await params).slug);
  if (!api) notFound();
  const platform = await getPlatformConfig();
  const gatewayUrl = buildPublicApiUrl({ configuredBaseUrl: process.env.API_PUBLIC_URL, platformUrl: platform.publicUrl, publicHost: api.publicHost, publicPath: api.endpoint });

  return <PortalShell>
    <div className="border-b border-[var(--line)] bg-[var(--surface)]">
      <div className="container-shell py-7">
        <Link href="/marketplace" className="inline-flex items-center gap-1.5 text-[11px] text-[var(--muted)]"><ArrowLeft className="size-3" />返回 API 市场</Link>
        <div className="mt-6 flex flex-col justify-between gap-5 lg:flex-row">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-bold">{api.name}</h1>{api.verified && <BadgeCheck className="size-5 fill-[var(--brand)] text-white" />}<span className="rounded-[4px] bg-[var(--surface-subtle)] px-2 py-1 text-[9px]">{api.version ?? "未标记版本"}</span></div><p className="mt-2 max-w-2xl text-[13px] leading-6 text-[var(--muted)]">{api.description}</p><p className="mt-2 text-[10px] text-[var(--muted)]">由 <strong className="text-[var(--ink)]">{api.provider}</strong> 提供 · 更新于 <LocalTime value={api.updatedAt} dateOnly /></p></div>
          <div className="flex gap-2"><Link href="/console/apps" className="inline-flex h-10 items-center gap-2 rounded-[6px] border border-[var(--line)] px-4 text-[11px] font-semibold"><KeyRound className="size-3.5" />管理密钥</Link><a href="#debug" className="inline-flex h-10 items-center gap-2 rounded-[6px] bg-[var(--brand)] px-4 text-[11px] font-semibold text-white">真实调试 <ExternalLink className="size-3.5" /></a></div>
        </div>
        <div className="mt-7 grid grid-cols-2 gap-px overflow-hidden rounded-[8px] border border-[var(--line)] bg-[var(--line)] sm:grid-cols-4"><Stat icon={CircleGauge} label="平均响应" value={api.latency == null ? "暂无数据" : `${api.latency} ms`} /><Stat icon={ShieldCheck} label="真实可用率" value={api.uptime == null ? "暂无数据" : `${api.uptime}%`} /><Stat icon={Clock3} label="默认限流" value={`${api.qpsLimit} QPS`} /><Stat icon={BookOpen} label="计费价格" value={api.price} /></div>
      </div>
    </div>
    <div className="container-shell grid gap-8 py-8 lg:grid-cols-[minmax(0,1fr)_260px]">
      <article className="min-w-0 space-y-8">
        <section><p className="eyebrow">ENDPOINT</p><h2 className="mt-2 text-lg font-bold">请求端点</h2><div className="mt-4 flex min-h-12 min-w-0 items-center overflow-hidden rounded-[7px] border border-[var(--line-strong)] bg-[var(--surface)]"><span className={cn("mono grid self-stretch place-items-center px-4 text-[10px] font-bold", getMethodClass(api.method))}>{api.method}</span><code className="mono min-w-0 flex-1 overflow-x-auto px-4 py-3 text-[11px]">{gatewayUrl}</code></div></section>
        <section><p className="eyebrow">AUTHENTICATION</p><h2 className="mt-2 text-lg font-bold">身份认证</h2><pre className="mono mt-4 overflow-x-auto rounded-[7px] border-l-2 border-[var(--brand)] bg-[var(--night)] p-4 text-[10px] text-[#c8e8dd]"><code>Authorization: Bearer $STAR_API_KEY</code></pre></section>
        <ContractSection title="请求参数" empty="该接口没有需要填写的请求参数。" headers={["名称", "位置", "必填", "类型", "默认值", "说明"]}>{api.requestParameters.map((parameter) => <tr key={parameter.id} className="border-t border-[var(--line)]"><td className="px-3 py-3"><code>{parameter.name}</code></td><td className="px-3 py-3">{parameter.location}</td><td className="px-3 py-3">{parameter.required ? "是" : "否"}</td><td className="px-3 py-3"><code>{parameter.dataType}</code></td><td className="px-3 py-3">{parameter.defaultValue ?? "-"}</td><td className="px-3 py-3 leading-5 text-[var(--muted)]">{parameter.description || "-"}</td></tr>)}</ContractSection>
        <ContractSection title="返回参数" empty="该接口返回纯文本、媒体或未定义结构化字段。" headers={["名称", "类型", "说明"]}>{api.responseParameters.map((parameter) => <tr key={parameter.id} className="border-t border-[var(--line)]"><td className="px-3 py-3"><code>{parameter.name}</code></td><td className="px-3 py-3"><code>{parameter.dataType}</code></td><td className="px-3 py-3 leading-5 text-[var(--muted)]">{parameter.description || "-"}</td></tr>)}</ContractSection>
        <section><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow">RESPONSE EXAMPLE</p><h2 className="mt-2 text-lg font-bold">返回示例</h2></div><span className="text-[9px] text-[var(--muted)]">{api.responseFormats.join(" / ")}</span></div><pre className="mono mt-4 max-h-96 overflow-auto rounded-[7px] border border-[var(--line)] bg-[var(--surface)] p-4 text-[10px] leading-5"><code>{typeof api.responseExample === "string" ? api.responseExample : JSON.stringify(api.responseExample ?? {}, null, 2)}</code></pre></section>
        <section><p className="eyebrow">SCHEMA</p><h2 className="mt-2 text-lg font-bold">原始 Schema</h2><pre className="mono mt-4 max-h-96 overflow-auto rounded-[7px] border border-[var(--line)] bg-[var(--surface)] p-4 text-[10px] leading-5"><code>{JSON.stringify(api.schema, null, 2)}</code></pre></section>
        <section id="debug" className="scroll-mt-28"><p className="eyebrow">PLAYGROUND</p><h2 className="mt-2 text-lg font-bold">在线请求调试</h2><p className="mt-2 text-[11px] text-[var(--muted)]">请求通过正式公开路由执行，并按订阅规则计量与计费。</p><div className="mt-4"><RequestPlayground api={api} gatewayUrl={gatewayUrl} /></div></section>
      </article>
      <aside className="space-y-4 lg:sticky lg:top-28 lg:self-start"><div className="panel p-4"><p className="eyebrow">SERVICE LEVEL</p><dl className="mt-3 space-y-3 text-[10px]"><div className="flex justify-between"><dt className="text-[var(--muted)]">配置 SLA</dt><dd>{api.sla}%</dd></div><div className="flex justify-between"><dt className="text-[var(--muted)]">累计真实调用</dt><dd>{api.calls.toLocaleString("zh-CN")}</dd></div><div className="flex justify-between"><dt className="text-[var(--muted)]">执行方式</dt><dd>{sourceLabel(api.upstreamType)}</dd></div></dl></div></aside>
    </div>
  </PortalShell>;
}

function Stat({ icon: Icon, label, value }: { icon: typeof CircleGauge; label: string; value: string }) {
  return <div className="bg-[var(--surface)] p-4"><span className="flex items-center gap-1.5 text-[9px] text-[var(--muted)]"><Icon className="size-3" />{label}</span><strong className="mt-1 block text-[13px]">{value}</strong></div>;
}

function ContractSection({ title, empty, headers, children }: { title: string; empty: string; headers: string[]; children: React.ReactNode }) {
  const hasRows = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return <section><p className="eyebrow">API CONTRACT</p><h2 className="mt-2 text-lg font-bold">{title}</h2><div className="mt-4 overflow-x-auto rounded-[8px] border border-[var(--line)]"><table className="w-full min-w-[640px] text-left text-[10px]"><thead className="bg-[var(--surface-subtle)] text-[var(--muted)]"><tr>{headers.map((header) => <th key={header} className="px-3 py-2.5 font-semibold">{header}</th>)}</tr></thead><tbody>{children}{!hasRows && <tr><td colSpan={headers.length} className="px-4 py-10 text-center text-[var(--muted)]">{empty}</td></tr>}</tbody></table></div></section>;
}
