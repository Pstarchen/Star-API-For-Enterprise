"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Activity, AppWindow, Boxes, Building2, ChevronDown, CreditCard, Gauge, KeyRound, LogOut, Menu, ScrollText, Settings, ShieldCheck, UserRound, Users, Webhook } from "lucide-react";
import { useState } from "react";
import { BrandMark } from "./brand-mark";
import { ThemeToggle } from "./theme-toggle";
import { cn } from "@/lib/utils";
import { useBranding } from "./branding-provider";

const workspaceIcons = { activity: Activity, apps: AppWindow, boxes: Boxes, building: Building2, billing: CreditCard, overview: Gauge, access: KeyRound, audits: ScrollText, settings: Settings, risk: ShieldCheck, users: Users, user: UserRound, webhooks: Webhook } as const;

export type WorkspaceNavItem = { href: string; label: string; icon: keyof typeof workspaceIcons; badge?: string };
export type WorkspaceOption = { id: string; name: string; type: "PERSONAL" | "ENTERPRISE"; status: string; role: string };

type CurrentUser = {
  name: string;
  email: string;
  workspaces: WorkspaceOption[];
};

export function WorkspaceShell({ children, nav, title, currentUser, admin = false }: { children: React.ReactNode; nav: WorkspaceNavItem[]; title: string; currentUser: CurrentUser; admin?: boolean }) {
  const pathname = usePathname();
  const branding = useBranding();
  const router = useRouter();
  const [workspaceId, setWorkspaceId] = useState(currentUser.workspaces[0]?.id ?? "");
  const [workspaceMenu, setWorkspaceMenu] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const workspace = currentUser.workspaces.find((item) => item.id === workspaceId) ?? currentUser.workspaces[0];

  function selectWorkspace(id: string) {
    setWorkspaceId(id);
    setWorkspaceMenu(false);
    localStorage.setItem("star-api-workspace", id);
  }

  async function logout() {
    setLoggingOut(true);
    await fetch("/api/v1/auth/logout", { method: "POST" }).catch(() => undefined);
    router.push("/login");
    router.refresh();
  }

  const initials = currentUser.name.slice(0, 1).toUpperCase();
  return <div className="workspace-atmosphere min-h-screen lg:grid lg:grid-cols-[232px_1fr]">
    <aside className="hidden min-h-screen overflow-hidden border-r border-white/10 bg-[var(--night)] text-white lg:fixed lg:inset-y-0 lg:flex lg:w-[232px] lg:flex-col">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-[url('/art/anime-operator.jpg')] bg-cover bg-[position:42%_center] opacity-[.08]" />
      <div className="relative flex h-16 items-center border-b border-white/10 px-5"><div className="rounded-[5px] bg-white p-1"><BrandMark compact /></div><div className="ml-2.5 min-w-0"><strong className="block truncate text-[13px]">{branding.name}</strong><span className="text-[9px] text-white/45">{admin ? "运营管理后台" : "开发者控制台"}</span></div></div>
      <div className="relative px-3 py-4"><button type="button" onClick={() => !admin && setWorkspaceMenu((value) => !value)} className="flex min-h-14 w-full items-center justify-between rounded-[5px] border border-white/10 bg-white/5 px-3 py-2.5 text-left hover:bg-white/10" aria-expanded={workspaceMenu}><span className="min-w-0"><span className="block truncate text-[11px] font-semibold">{admin ? "平台运营中心" : workspace?.name ?? "暂无工作区"}</span><span className="mt-0.5 block text-[9px] text-white/40">{admin ? "平台管理员" : workspace ? `${workspace.type === "ENTERPRISE" ? "企业" : "个人"}空间 · ${workspace.role}` : "联系管理员创建空间"}</span></span>{!admin && <ChevronDown className="size-3.5 shrink-0 text-white/40" />}</button>
        {workspaceMenu && !admin && <div className="absolute inset-x-3 top-[76px] z-40 overflow-hidden rounded-[5px] border border-white/10 bg-[var(--night-soft)] shadow-xl">{currentUser.workspaces.map((item) => <button key={item.id} type="button" onClick={() => selectWorkspace(item.id)} className="flex w-full items-center gap-2.5 border-b border-white/10 px-3 py-3 text-left last:border-0 hover:bg-white/5">{item.type === "ENTERPRISE" ? <Building2 className="size-4 shrink-0 text-[#8d9bff]" /> : <UserRound className="size-4 shrink-0 text-[#f18cb4]" />}<span className="min-w-0"><strong className="block truncate text-[10px]">{item.name}</strong><small className="text-[8px] text-white/40">{item.status === "ACTIVE" ? "正常" : "待认证"} · {item.role}</small></span></button>)}</div>}
      </div>
      <nav className="relative flex-1 space-y-1 px-3" aria-label={title}>{nav.map((item) => { const active = item.href === "/console" || item.href === "/admin" ? pathname === item.href : pathname.startsWith(item.href); const Icon = workspaceIcons[item.icon]; return <Link key={item.href} href={item.href} className={cn("flex h-10 items-center gap-3 rounded-[5px] px-3 text-[11px] font-medium text-white/60 transition hover:bg-white/5 hover:text-white", active && "bg-white/10 text-white")}><Icon className={cn("size-4", active && "text-[#9aa7ff]")} /><span>{item.label}</span>{item.badge && <span className="ml-auto rounded-full bg-[#f18cb4]/15 px-2 py-0.5 text-[9px] text-[#f5a6c5]">{item.badge}</span>}</Link>; })}</nav>
      <div className="relative border-t border-white/10 p-3"><Link href="/marketplace" className="flex items-center gap-3 rounded-[5px] px-3 py-2.5 text-[10px] text-white/45 hover:bg-white/5 hover:text-white"><Menu className="size-3.5" /> 返回 API 市场</Link><div className="mt-2 flex items-center gap-2 px-3 py-2"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#f18cb4] text-[10px] font-bold text-[#221520]">{initials}</span><div className="min-w-0 flex-1"><strong className="block truncate text-[10px]">{currentUser.name}</strong><span className="block truncate text-[8px] text-white/35">{currentUser.email}</span></div><button type="button" onClick={logout} disabled={loggingOut} className="grid size-7 place-items-center text-white/40 hover:text-white disabled:opacity-40" aria-label="退出登录" title="退出登录"><LogOut className="size-3.5" /></button></div></div>
    </aside>

    <div className="min-w-0 lg:col-start-2"><header className="workspace-glass sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-[var(--line)] px-4 sm:px-6"><div className="lg:hidden"><BrandMark compact /></div><div><h1 className="text-[15px] font-bold">{title}</h1><p className="hidden text-[9px] text-[var(--muted)] sm:block">{admin ? "平台全局视图" : workspace?.name ?? "开发者工作区"}</p></div>{!admin && workspace && <select value={workspaceId} onChange={(event) => selectWorkspace(event.target.value)} className="ml-auto max-w-36 border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 text-[9px] lg:hidden" aria-label="当前工作区">{currentUser.workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}<div className={cn("flex items-center gap-1", admin ? "ml-auto" : "lg:ml-auto")}><ThemeToggle className="grid size-8 place-items-center rounded-[4px] text-[var(--muted)] hover:bg-[var(--surface-subtle)]" /><button type="button" onClick={logout} disabled={loggingOut} className="grid size-8 place-items-center rounded-[4px] text-[var(--muted)] hover:bg-[var(--surface-subtle)] lg:hidden" aria-label="退出登录"><LogOut className="size-4" /></button></div></header>
      <nav className="flex gap-1 overflow-x-auto border-b border-[var(--line)] bg-[var(--surface)] px-3 py-2 lg:hidden" aria-label="移动端控制台导航">{nav.map((item) => { const Icon = workspaceIcons[item.icon]; return <Link key={item.href} href={item.href} className={cn("flex shrink-0 items-center gap-1.5 rounded-[4px] px-3 py-2 text-[10px] text-[var(--muted)]", pathname === item.href && "bg-[var(--night)] text-white")}><Icon className="size-3.5" />{item.label}</Link>; })}</nav><main className="p-4 sm:p-6 xl:p-8">{children}</main>
    </div>
  </div>;
}
