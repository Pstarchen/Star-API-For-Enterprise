"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChevronDown, HelpCircle, Menu, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { BrandMark } from "./brand-mark";
import { cn } from "@/lib/utils";

export type WorkspaceNavItem = { href: string; label: string; icon: LucideIcon; badge?: string };

export function WorkspaceShell({ children, nav, title, admin = false }: { children: React.ReactNode; nav: WorkspaceNavItem[]; title: string; admin?: boolean }) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen bg-[var(--canvas)] lg:grid lg:grid-cols-[224px_1fr]">
      <aside className="hidden min-h-screen border-r border-white/10 bg-[var(--night)] text-white lg:fixed lg:inset-y-0 lg:flex lg:w-56 lg:flex-col">
        <div className="flex h-16 items-center border-b border-white/10 px-5"><div className="rounded-[5px] bg-white p-1"><BrandMark compact /></div><div className="ml-2.5"><strong className="block text-[13px]">星枢 API</strong><span className="text-[9px] text-white/45">{admin ? "运营管理后台" : "企业开发者控制台"}</span></div></div>
        <div className="px-3 py-4"><button className="flex w-full items-center justify-between rounded-[5px] border border-white/10 bg-white/5 px-3 py-2.5 text-left"><span><span className="block text-[11px] font-semibold">{admin ? "平台运营中心" : "星海科技集团"}</span><span className="mt-0.5 block text-[9px] text-white/40">{admin ? "超级管理员" : "企业版 · 生产环境"}</span></span><ChevronDown className="size-3.5 text-white/40" /></button></div>
        <nav className="flex-1 space-y-1 px-3" aria-label={title}>{nav.map((item) => { const active = item.href === "/console" || item.href === "/admin" ? pathname === item.href : pathname.startsWith(item.href); return <Link key={item.href} href={item.href} className={cn("flex h-10 items-center gap-3 rounded-[5px] px-3 text-[11px] font-medium text-white/60 transition hover:bg-white/5 hover:text-white", active && "bg-white/10 text-white")}><item.icon className={cn("size-4", active && "text-[#6bdeb8]")} /><span>{item.label}</span>{item.badge && <span className="ml-auto rounded-full bg-[#6bdeb8]/15 px-2 py-0.5 text-[9px] text-[#8be7c8]">{item.badge}</span>}</Link>; })}</nav>
        <div className="border-t border-white/10 p-3"><Link href="/" className="flex items-center gap-3 rounded-[5px] px-3 py-2.5 text-[10px] text-white/45 hover:bg-white/5 hover:text-white"><Menu className="size-3.5" /> 返回 API 市场</Link><div className="mt-2 flex items-center gap-2 px-3 py-2"><span className="grid size-7 place-items-center rounded-full bg-[#d4a348] text-[10px] font-bold text-[var(--night)]">林</span><div className="min-w-0"><strong className="block truncate text-[10px]">林知远</strong><span className="block text-[9px] text-white/35">企业管理员</span></div></div></div>
      </aside>

      <div className="min-w-0 lg:col-start-2">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-[var(--line)] bg-white/95 px-4 backdrop-blur sm:px-6">
          <div className="lg:hidden"><BrandMark compact /></div>
          <div><h1 className="text-[15px] font-bold">{title}</h1><p className="hidden text-[9px] text-[var(--muted)] sm:block">最后同步：今天 14:32</p></div>
          <div className="ml-auto flex items-center gap-1"><button className="hidden h-8 w-52 items-center gap-2 rounded-[4px] border border-[var(--line)] px-3 text-left text-[10px] text-[var(--muted)] md:flex"><Search className="size-3.5" /> 搜索资源 <kbd className="ml-auto">⌘K</kbd></button><button className="grid size-8 place-items-center rounded-[4px] text-[var(--muted)] hover:bg-[var(--surface-subtle)]" aria-label="帮助"><HelpCircle className="size-4" /></button><button className="relative grid size-8 place-items-center rounded-[4px] text-[var(--muted)] hover:bg-[var(--surface-subtle)]" aria-label="通知"><Bell className="size-4" /><span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-[var(--warning)]" /></button></div>
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b border-[var(--line)] bg-white px-3 py-2 lg:hidden" aria-label="移动端控制台导航">{nav.map((item) => <Link key={item.href} href={item.href} className={cn("flex shrink-0 items-center gap-1.5 rounded-[4px] px-3 py-2 text-[10px] text-[var(--muted)]", pathname === item.href && "bg-[var(--night)] text-white")}><item.icon className="size-3.5" />{item.label}</Link>)}</nav>
        <main className="p-4 sm:p-6 xl:p-8">{children}</main>
      </div>
    </div>
  );
}
