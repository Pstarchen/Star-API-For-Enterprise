import type { Metadata } from "next";
import { Check, Database, Settings2, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { BrandMark } from "@/components/brand-mark";
import { InstallationForm } from "@/components/installation-form";
import { isInstalled } from "@/lib/server/installation";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = { title: "初始化平台" };

const steps = [
  { icon: Database, label: "运行环境", detail: "数据库连接与迁移已就绪", done: true },
  { icon: Settings2, label: "平台信息", detail: "设置名称与公开访问地址", done: false },
  { icon: ShieldCheck, label: "管理员", detail: "创建首个平台管理员", done: false },
];

export default async function InstallPage() {
  await connection();
  if (await isInstalled()) redirect("/login");

  return <main className="install-scene min-h-[100dvh]">
    <aside className="install-story">
      <div className="inline-block self-start rounded-[7px] bg-white p-1.5"><BrandMark /></div>
      <div className="my-auto"><p className="mono text-[10px] text-[#7ae0c0]">SYSTEM INITIALIZATION</p><h1 className="mt-4 text-3xl font-bold leading-[1.35]">配置你的 API 服务平台</h1>
      <div className="mt-9 space-y-1">
        {steps.map((step, index) => <div key={step.label} className="relative flex gap-4 py-4">
          {index < steps.length - 1 && <span className="absolute left-[15px] top-12 h-8 w-px bg-white/15" />}
          <span className={`grid size-8 shrink-0 place-items-center rounded-[7px] ${step.done ? "bg-[#6bdeb8] text-[var(--night)]" : "border border-white/20 bg-white/[.04] text-white/55"}`}>{step.done ? <Check className="size-4" /> : <step.icon className="size-4" />}</span>
          <span><strong className="block text-[11px]">{step.label}</strong><small className="mt-1 block text-[9px] text-white/40">{step.detail}</small></span>
        </div>)}
      </div></div>
    </aside>
    <section className="install-dock"><ThemeToggle className="absolute right-5 top-5 grid size-9 place-items-center rounded-[7px] text-[var(--muted)] transition hover:bg-[var(--surface-subtle)]" />
      <div className="w-full max-w-[680px]">
        <p className="mono text-[10px] font-semibold text-[var(--brand)]">首次安装</p>
        <h2 className="mt-3 text-2xl font-bold">创建平台与管理员</h2>
        <p className="mt-2 text-[11px] leading-5 text-[var(--muted)]">以下配置保存后，初始化入口将自动关闭。</p>
        <div className="mt-8 border-t border-[var(--line)] pt-6"><InstallationForm /></div>
      </div>
    </section>
  </main>;
}
