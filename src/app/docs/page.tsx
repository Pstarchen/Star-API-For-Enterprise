import { BookOpen, CheckCircle2, KeyRound, Rocket, ShieldCheck } from "lucide-react";
import { PortalShell } from "@/components/portal-shell";

const steps = [
  { title: "创建企业应用", text: "在控制台按环境创建应用，测试与生产密钥相互隔离。", icon: Rocket },
  { title: "获取 API Key", text: "密钥创建后仅展示一次，可按成员权限控制查看和轮换。", icon: KeyRound },
  { title: "调用统一网关", text: "所有能力共享域名、鉴权和错误格式，减少重复适配。", icon: ShieldCheck },
  { title: "观察与治理", text: "通过调用日志、告警和配额策略持续管理服务质量。", icon: CheckCircle2 },
];

export default function DocsPage() {
  return <PortalShell><div className="container-shell py-10"><div className="max-w-2xl"><p className="eyebrow">QUICK START</p><h1 className="mt-3 text-3xl font-bold">十五分钟完成首次接入</h1><p className="mt-3 text-[14px] leading-7 text-[var(--muted)]">统一网关遵循 REST 语义，响应结构、错误码和追踪标识在所有 API 中保持一致。</p></div><div className="mt-9 grid gap-px overflow-hidden border border-[var(--line)] bg-[var(--line)] md:grid-cols-2">{steps.map((step, index) => <section key={step.title} className="bg-white p-6"><div className="flex items-center justify-between"><step.icon className="size-5 text-[var(--brand)]" /><span className="mono text-[10px] text-[var(--muted)]">0{index + 1}</span></div><h2 className="mt-7 text-base font-bold">{step.title}</h2><p className="mt-2 text-[12px] leading-6 text-[var(--muted)]">{step.text}</p></section>)}</div><section className="mt-10"><div className="flex items-center gap-2"><BookOpen className="size-4 text-[var(--brand)]" /><h2 className="text-lg font-bold">最小请求示例</h2></div><pre className="mono mt-4 overflow-x-auto bg-[var(--night)] p-5 text-[11px] leading-6 text-[#c8e8dd]"><code>{`curl --request POST 'https://gateway.starapi.cn/v1/enterprise/verify' \\\n  --header 'Authorization: Bearer $STAR_API_KEY' \\\n  --header 'Content-Type: application/json' \\\n  --data '{"companyName":"上海星枢科技有限公司"}'`}</code></pre></section></div></PortalShell>;
}
