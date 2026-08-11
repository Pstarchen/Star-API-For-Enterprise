import { BookOpen, KeyRound, ListChecks, RadioTower } from "lucide-react";
import { connection } from "next/server";
import { PortalShell } from "@/components/portal-shell";
import { buildPublicApiUrl } from "@/lib/api-routes";
import { listCatalogProducts } from "@/lib/server/catalog";
import { getPlatformConfig } from "@/lib/server/installation";

const steps = [
  { title: "创建应用", text: "在开发者控制台创建测试或生产应用。", icon: ListChecks },
  { title: "生成密钥", text: "密钥完整值只在创建时显示一次。", icon: KeyRound },
  { title: "订阅 API", text: "为指定应用订阅已发布接口。", icon: BookOpen },
  { title: "调用网关", text: "请求通过统一网关执行鉴权、限流、计量与计费。", icon: RadioTower },
];

export default async function DocsPage() {
  await connection();
  const [platform, products] = await Promise.all([getPlatformConfig(), listCatalogProducts({ status: "PUBLISHED", limit: 1 })]);
  const api = products[0];
  const endpoint = api ? buildPublicApiUrl({ configuredBaseUrl: process.env.API_PUBLIC_URL, platformUrl: platform.publicUrl, publicHost: api.publicHost, publicPath: api.endpoint }) : null;
  const curl = api && endpoint ? [`curl --request ${api.method} '${endpoint}'`, "  --header 'Authorization: Bearer $STAR_API_KEY'", ...(!["GET", "HEAD"].includes(api.method) ? ["  --header 'Content-Type: application/json'", "  --data '{}'" ] : [])].join(" \\\n") : null;
  return <PortalShell><div className="container-shell py-10"><div className="max-w-2xl"><p className="eyebrow">QUICK START</p><h1 className="mt-3 text-3xl font-bold">接入文档</h1><p className="mt-3 text-[13px] leading-7 text-[var(--muted)]">统一网关使用 API Key 鉴权，并按已订阅 API 的真实策略限流、计量与计费。</p></div><div className="mt-9 grid gap-px overflow-hidden rounded-[8px] border border-[var(--line)] bg-[var(--line)] md:grid-cols-2">{steps.map((step, index) => <section key={step.title} className="bg-[var(--surface)] p-6"><div className="flex items-center justify-between"><step.icon className="size-5 text-[var(--brand)]" /><span className="mono text-[10px] text-[var(--muted)]">0{index + 1}</span></div><h2 className="mt-7 text-base font-bold">{step.title}</h2><p className="mt-2 text-[11px] leading-6 text-[var(--muted)]">{step.text}</p></section>)}</div><section className="mt-10"><div className="flex items-center gap-2"><BookOpen className="size-4 text-[var(--brand)]" /><h2 className="text-lg font-bold">当前可用端点请求</h2></div>{curl ? <><p className="mt-2 text-[10px] text-[var(--muted)]">端点：{api?.name}</p><pre className="mono mt-4 overflow-x-auto rounded-[7px] bg-[var(--night)] p-5 text-[10px] leading-6 text-[#c8e8dd]"><code>{curl}</code></pre></> : <div className="mt-4 rounded-[8px] border border-dashed border-[var(--line)] py-12 text-center text-[10px] text-[var(--muted)]">管理员发布 API 后将生成真实请求示例</div>}</section></div></PortalShell>;
}
