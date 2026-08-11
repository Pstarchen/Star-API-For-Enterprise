"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Activity, AppWindow, Boxes, Building2, Check, ChevronDown, CreditCard, Gauge, KeyRound, LogOut, Menu, ScrollText, Settings, ShieldCheck, UserRound, Users, Webhook } from "lucide-react";
import { useState } from "react";
import { BrandMark } from "./brand-mark";
import { ThemeToggle } from "./theme-toggle";
import { useBranding } from "./branding-provider";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { cn } from "@/lib/utils";

const workspaceIcons = { activity: Activity, apps: AppWindow, boxes: Boxes, building: Building2, billing: CreditCard, overview: Gauge, access: KeyRound, audits: ScrollText, settings: Settings, risk: ShieldCheck, users: Users, user: UserRound, webhooks: Webhook } as const;

export type WorkspaceSubNavItem = { href: string; label: string; icon: keyof typeof workspaceIcons; exact?: boolean };
export type WorkspaceNavItem = { href: string; label: string; icon: keyof typeof workspaceIcons; badge?: string; items?: WorkspaceSubNavItem[] };
export type WorkspaceOption = { id: string; name: string; type: "PERSONAL" | "ENTERPRISE"; status: string; role: string };
type CurrentUser = { name: string; email: string; workspaces: WorkspaceOption[] };

function routeMatches(pathname: string, href: string, exact = false) {
  return pathname === href || (!exact && pathname.startsWith(`${href}/`));
}

export function WorkspaceShell({ children, nav, title, currentUser, admin = false }: { children: React.ReactNode; nav: WorkspaceNavItem[]; title: string; currentUser: CurrentUser; admin?: boolean }) {
  const pathname = usePathname();
  const branding = useBranding();
  const router = useRouter();
  const [workspaceId, setWorkspaceId] = useState(currentUser.workspaces[0]?.id ?? "");
  const [loggingOut, setLoggingOut] = useState(false);
  const workspace = currentUser.workspaces.find((item) => item.id === workspaceId) ?? currentUser.workspaces[0];
  const initials = currentUser.name.slice(0, 1).toUpperCase();
  const activeGroup = nav.find((item) => item.items?.length
    ? item.items.some((section) => routeMatches(pathname, section.href, section.exact))
    : routeMatches(pathname, item.href, item.href === "/console" || item.href === "/admin")) ?? nav[0];
  const activeSection = activeGroup?.items
    ?.filter((item) => routeMatches(pathname, item.href, item.exact))
    .sort((left, right) => right.href.length - left.href.length)[0];
  const activeTitle = activeSection?.label ?? activeGroup?.label ?? title;

  async function selectWorkspace(id: string) {
    setWorkspaceId(id);
    const response = await fetch("/api/v1/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenantId: id }) });
    if (response.ok) router.refresh();
  }

  async function logout() {
    setLoggingOut(true);
    await fetch("/api/v1/auth/logout", { method: "POST" }).catch(() => undefined);
    router.push("/login");
    router.refresh();
  }

  return <TooltipProvider delayDuration={350}><div className={cn("workspace-frame min-h-[100dvh]", admin && "is-admin")}>
    <aside className="workspace-sidebar hidden min-h-[100dvh] overflow-hidden lg:fixed lg:inset-y-0 lg:flex lg:flex-col">
      <div className="workspace-brand-row">
        <BrandMark compact />
        <div className="min-w-0"><strong className="block truncate text-[15px]">{branding.name}</strong><span className="mt-0.5 block text-[11px] font-medium text-[var(--muted)]">{admin ? "平台运营后台" : "开发者控制台"}</span></div>
      </div>

      <div className="px-3 pb-3 pt-4">
        {admin ? <div className="workspace-scope"><span className="workspace-scope-icon"><ShieldCheck /></span><span className="min-w-0"><strong>平台运营中心</strong><small>全局配置与业务治理</small></span><span className="ml-auto size-1.5 rounded-full bg-[var(--success)] shadow-[0_0_0_4px_var(--success-soft)]" /></div> : <DropdownMenu><DropdownMenuTrigger asChild><button type="button" className="workspace-scope w-full text-left"><span className="workspace-scope-icon"><Building2 /></span><span className="min-w-0 flex-1"><strong className="truncate">{workspace?.name ?? "暂无工作区"}</strong><small>{workspace ? `${workspace.type === "ENTERPRISE" ? "企业" : "个人"}空间 · ${workspace.role}` : "等待创建空间"}</small></span><ChevronDown className="size-3.5 text-[var(--muted)]" /></button></DropdownMenuTrigger><DropdownMenuContent side="right" align="start" className="w-64"><DropdownMenuLabel>切换工作区</DropdownMenuLabel>{currentUser.workspaces.map((item) => <DropdownMenuItem key={item.id} onSelect={() => selectWorkspace(item.id)} className="h-auto min-h-11 py-2"><span className={cn("grid size-8 place-items-center rounded-[7px]", item.type === "ENTERPRISE" ? "bg-[var(--brand-soft)] text-[var(--brand)]" : "bg-[var(--accent-soft)] text-[var(--accent)]")}>{item.type === "ENTERPRISE" ? <Building2 /> : <UserRound />}</span><span className="min-w-0 flex-1"><strong className="block truncate text-xs">{item.name}</strong><small className="text-[11px] text-[var(--muted)]">{item.status === "ACTIVE" ? "正常" : "待认证"} · {item.role}</small></span>{item.id === workspaceId && <Check className="text-[var(--brand)]" />}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>}
      </div>

      <div className="workspace-nav-label">功能导航</div>
      <nav className="workspace-nav flex-1" aria-label={title}>{nav.map((item) => {
        const active = activeGroup?.href === item.href;
        const Icon = workspaceIcons[item.icon];
        return <Link key={item.href} href={item.href} className={cn("workspace-nav-item", active && "is-active")}><span className="workspace-nav-icon"><Icon /></span><span className="min-w-0 flex-1 truncate">{item.label}</span>{item.badge && <Badge variant="accent" className="h-[18px]">{item.badge}</Badge>}</Link>;
      })}</nav>

      <div className="workspace-account">
        <Link href="/marketplace" className="workspace-market-link"><Menu />返回 API 市场</Link>
        <DropdownMenu><DropdownMenuTrigger asChild><button type="button" className="workspace-account-trigger"><Avatar><AvatarFallback>{initials}</AvatarFallback></Avatar><span className="min-w-0 flex-1"><strong>{currentUser.name}</strong><small>{currentUser.email}</small></span><ChevronDown /></button></DropdownMenuTrigger><DropdownMenuContent side="right" align="end" className="w-56"><DropdownMenuLabel>{admin ? "管理员账户" : "开发者账户"}</DropdownMenuLabel><DropdownMenuSeparator /><DropdownMenuItem asChild><Link href="/console/settings"><Settings />账户与企业设置</Link></DropdownMenuItem><DropdownMenuItem asChild><Link href="/marketplace"><Boxes />API 市场</Link></DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onSelect={logout} disabled={loggingOut} className="text-[var(--danger)] focus:text-[var(--danger)]"><LogOut />{loggingOut ? "正在退出" : "退出登录"}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
      </div>
    </aside>

    <div className="workspace-main min-w-0">
      <header className="workspace-topbar sticky top-0 z-30">
        <div className="rounded-[7px] bg-[var(--surface-raised)] p-1 shadow-[var(--shadow-xs)] lg:hidden"><BrandMark compact /></div>
        <div className="workspace-topbar-title min-w-0"><span>{admin ? activeGroup?.label ?? "平台运营" : workspace?.name ?? "STAR WORKSPACE"}</span><h1 className="truncate">{activeTitle}</h1></div>
        {activeGroup?.items?.length ? <nav className="workspace-section-nav hidden lg:flex" aria-label={`${activeGroup.label}模块`}>{activeGroup.items.map((item) => { const Icon = workspaceIcons[item.icon]; return <Link key={item.href} href={item.href} className={cn("workspace-section-item", activeSection?.href === item.href && "is-active")}><Icon />{item.label}</Link>; })}</nav> : null}
        {!admin && workspace && <Select value={workspaceId} onValueChange={selectWorkspace}><SelectTrigger size="sm" className="ml-auto w-28 shrink-0 lg:hidden" aria-label="当前工作区"><SelectValue /></SelectTrigger><SelectContent>{currentUser.workspaces.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>}
        <div className={cn("flex items-center gap-1", admin ? "ml-auto" : "lg:ml-auto")}><span className="mr-2 hidden items-center gap-2 text-xs text-[var(--muted)] sm:flex"><span className="size-1.5 rounded-full bg-[var(--success)]" />服务在线</span><Tooltip><TooltipTrigger asChild><ThemeToggle className="grid size-9 place-items-center rounded-[7px] text-[var(--muted)] transition hover:bg-[var(--surface-subtle)] hover:text-[var(--ink)]" /></TooltipTrigger><TooltipContent>切换深浅色模式</TooltipContent></Tooltip><Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon" onClick={logout} disabled={loggingOut} className="lg:hidden" aria-label="退出登录"><LogOut /></Button></TooltipTrigger><TooltipContent>退出登录</TooltipContent></Tooltip></div>
      </header>
      <nav className="workspace-mobile-nav lg:hidden" aria-label="移动端控制台导航">{nav.map((item) => { const active = activeGroup?.href === item.href; const Icon = workspaceIcons[item.icon]; return <Link key={item.href} href={item.href} className={cn("workspace-mobile-item", active && "is-active")}><Icon />{item.label}{item.badge && <Badge variant="accent" className="h-4 px-1.5 text-[10px]">{item.badge}</Badge>}</Link>; })}</nav>
      {activeGroup?.items?.length ? <nav className="workspace-context-nav lg:hidden" aria-label={`${activeGroup.label}子导航`}>{activeGroup.items.map((item) => { const Icon = workspaceIcons[item.icon]; return <Link key={item.href} href={item.href} className={cn("workspace-context-item", activeSection?.href === item.href && "is-active")}><Icon />{item.label}</Link>; })}</nav> : null}
      <main className="workspace-content">{children}</main>
    </div>
  </div></TooltipProvider>;
}
