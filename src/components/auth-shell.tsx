import Link from "next/link";
import { ArrowLeft, CheckCircle2, ShieldCheck } from "lucide-react";
import { BrandMark } from "./brand-mark";

const trustItems = ["统一密钥访问全部 API", "个人与企业空间完全隔离", "调用、配额和费用实时可见"];

export function AuthShell({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <main className="grid min-h-screen bg-white lg:grid-cols-[.8fr_1.2fr]">
    <aside className="relative hidden overflow-hidden bg-[var(--night)] p-10 text-white lg:flex lg:flex-col">
      <div className="relative z-10 rounded-[5px] bg-white p-1.5 self-start"><BrandMark /></div>
      <div className="relative z-10 my-auto max-w-md"><p className="mono text-[10px] text-[#6bdeb8]">IDENTITY / ACCESS / GOVERNANCE</p><h2 className="mt-5 text-3xl font-bold leading-tight">一个账号，管理从试验到生产的每次调用</h2><div className="mt-8 space-y-4">{trustItems.map((item) => <div key={item} className="flex items-center gap-3 text-[12px] text-white/65"><CheckCircle2 className="size-4 text-[#6bdeb8]" />{item}</div>)}</div></div>
      <div className="relative z-10 flex items-center gap-2 text-[10px] text-white/40"><ShieldCheck className="size-3.5" /> 登录与注册全程加密传输</div>
    </aside>
    <section className="flex min-h-screen flex-col px-5 py-6 sm:px-10 lg:px-16">
      <div className="flex items-center justify-between"><div className="lg:hidden"><BrandMark /></div><Link href="/" className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-[var(--muted)] hover:text-[var(--ink)]"><ArrowLeft className="size-3" /> 返回 API 市场</Link></div>
      <div className="mx-auto my-auto w-full max-w-[460px] py-10"><h1 className="text-2xl font-bold">{title}</h1><p className="mt-2 text-[12px] leading-6 text-[var(--muted)]">{description}</p><div className="mt-7">{children}</div></div>
      <p className="text-center text-[9px] text-[var(--muted)]">© 2026 星枢 API · 服务协议 · 隐私政策</p>
    </section>
  </main>;
}
