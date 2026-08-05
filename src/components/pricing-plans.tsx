"use client";

import Link from "next/link";
import { Check, UserRound, Building2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const personalPlans = [
  { name: "免费版", description: "学习、验证想法和轻量调用", price: "¥0", suffix: "永久免费", action: "免费注册", features: ["1 枚 API Key", "开放接口免费调用", "每月 10,000 次认证调用", "基础 QPS 与调用日志"] },
  { name: "个人专业版", description: "独立开发者和正式个人项目", price: "¥29", suffix: "/ 月", action: "选择专业版", featured: true, features: ["5 枚 API Key", "每月 300,000 次调用", "单接口最高 20 QPS", "付费接口 9 折", "90 天日志保留"] },
  { name: "个人按量版", description: "调用波动大，不需要固定套餐", price: "按量", suffix: "用多少付多少", action: "充值使用", features: ["余额永不过期", "全部接口按次计费", "3 枚 API Key", "消费与配额告警"] },
];

const enterprisePlans = [
  { name: "团队版", description: "小型团队和商业项目", price: "¥199", suffix: "/ 月起", action: "创建团队", features: ["10 名团队成员", "20 枚 API Key", "单接口最高 100 QPS", "角色与项目隔离", "统一团队账单"] },
  { name: "企业版", description: "核心生产系统与多部门治理", price: "¥999", suffix: "/ 月起", action: "申请企业版", featured: true, features: ["不限团队成员", "生产级 SLA", "200+ QPS 可扩展", "企业实名与合同发票", "专属支持与审计"] },
  { name: "专有部署", description: "监管、金融和大型集团", price: "定制", suffix: "专属方案", action: "联系销售", features: ["独立网关与资源池", "专线或私有网络", "自定义数据保留", "SSO 与组织同步", "灾备与演练支持"] },
];

export function PricingPlans() {
  const [audience, setAudience] = useState<"personal" | "enterprise">("personal");
  const plans = audience === "personal" ? personalPlans : enterprisePlans;
  return <>
    <div className="mx-auto mt-7 grid w-full max-w-sm grid-cols-2 rounded-[6px] bg-[var(--surface-subtle)] p-1" role="tablist" aria-label="套餐用户类型"><button onClick={() => setAudience("personal")} className={cn("flex h-10 items-center justify-center gap-2 rounded-[4px] text-[11px] font-semibold text-[var(--muted)]", audience === "personal" && "bg-white text-[var(--ink)] shadow-sm")} role="tab" aria-selected={audience === "personal"}><UserRound className="size-3.5" />个人用户</button><button onClick={() => setAudience("enterprise")} className={cn("flex h-10 items-center justify-center gap-2 rounded-[4px] text-[11px] font-semibold text-[var(--muted)]", audience === "enterprise" && "bg-white text-[var(--ink)] shadow-sm")} role="tab" aria-selected={audience === "enterprise"}><Building2 className="size-3.5" />企业用户</button></div>
    <div className="mt-8 grid overflow-hidden border-l border-t border-[var(--line)] lg:grid-cols-3">{plans.map((plan) => <article key={plan.name} className={cn("relative flex min-h-[430px] flex-col border-b border-r border-[var(--line)] bg-white p-6", plan.featured && "bg-[#f6fbf9]")}>
      {plan.featured && <span className="absolute right-4 top-4 rounded-[3px] bg-[var(--brand)] px-2 py-1 text-[9px] font-bold text-white">推荐</span>}
      <h2 className="text-base font-bold">{plan.name}</h2><p className="mt-2 min-h-10 text-[11px] leading-5 text-[var(--muted)]">{plan.description}</p><div className="mt-6 flex items-end gap-2"><strong className="text-3xl">{plan.price}</strong><span className="pb-1 text-[10px] text-[var(--muted)]">{plan.suffix}</span></div><Link href="/register" className={cn("mt-6 flex h-10 items-center justify-center rounded-[4px] border border-[var(--line-strong)] text-[11px] font-semibold hover:bg-[var(--surface-subtle)]", plan.featured && "border-[var(--brand)] bg-[var(--brand)] text-white hover:bg-[var(--brand-strong)]")}>{plan.action}</Link><ul className="mt-6 space-y-3 border-t border-[var(--line)] pt-5">{plan.features.map((feature) => <li key={feature} className="flex gap-2 text-[10px] text-[var(--muted)]"><Check className="mt-0.5 size-3.5 shrink-0 text-[var(--brand)]" />{feature}</li>)}</ul>
    </article>)}</div>
  </>;
}
