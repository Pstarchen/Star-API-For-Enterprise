"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, Boxes, ChevronDown, CreditCard, Home, LayoutDashboard, LogOut, Menu, Settings, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import { BrandMark } from "./brand-mark";
import { StatusRail, type GatewayStatus } from "./status-rail";
import { ThemeToggle } from "./theme-toggle";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Button } from "./ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "首页", icon: Home },
  { href: "/marketplace", label: "API 市场", icon: Boxes },
  { href: "/docs", label: "接入文档", icon: BookOpen },
  { href: "/pricing", label: "价格方案", icon: CreditCard },
  { href: "/console", label: "开发者控制台", icon: LayoutDashboard },
];

type PortalUser = { name: string; email: string; platformRole: "USER" | "ADMIN" };

export function PortalHeader({ currentUser, gatewayStatus }: { currentUser: PortalUser | null; gatewayStatus: GatewayStatus }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const initials = currentUser?.name.slice(0, 1).toUpperCase();

  async function logout() {
    setLoggingOut(true);
    await fetch("/api/v1/auth/logout", { method: "POST" }).catch(() => undefined);
    setOpen(false);
    router.push("/");
    router.refresh();
  }

  return <TooltipProvider delayDuration={350}>
    <header className="sticky top-0 z-40">
      <StatusRail status={gatewayStatus} />
      <div className="portal-glass">
        <div className="container-shell flex h-16 items-center gap-6">
          <BrandMark />
          <nav className="hidden h-full items-center gap-0.5 md:flex" aria-label="主导航">{links.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return <Link key={item.href} href={item.href} className={cn("relative flex h-full items-center px-3 text-[12px] font-medium text-[var(--muted)] transition hover:text-[var(--ink)]", active && "text-[var(--ink)] after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-[var(--brand)]")}>{item.label}</Link>;
          })}</nav>

          <div className="relative ml-auto hidden items-center gap-2 sm:flex">
            <Tooltip><TooltipTrigger asChild><ThemeToggle className="grid size-9 place-items-center rounded-[7px] text-[var(--muted)] transition hover:bg-[var(--surface-subtle)] hover:text-[var(--ink)]" /></TooltipTrigger><TooltipContent>切换深浅色模式</TooltipContent></Tooltip>
            {currentUser ? <DropdownMenu>
              <DropdownMenuTrigger asChild><button type="button" className="ml-1 flex h-10 max-w-52 items-center gap-2 rounded-[7px] border border-[var(--line)] bg-[var(--surface-raised)] px-2.5 text-left outline-none transition hover:border-[var(--line-strong)] focus-visible:ring-3 focus-visible:ring-[var(--focus-soft)]"><Avatar className="size-7"><AvatarFallback>{initials}</AvatarFallback></Avatar><span className="min-w-0"><strong className="block truncate text-[10px]">{currentUser.name}</strong><small className="block text-[8px] text-[var(--muted)]">{currentUser.platformRole === "ADMIN" ? "平台管理员" : "开发者账号"}</small></span><ChevronDown className="size-3.5 shrink-0 text-[var(--muted)]" /></button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64"><DropdownMenuLabel className="py-2"><strong className="block truncate text-[10px] text-[var(--ink)]">{currentUser.name}</strong><span className="mt-0.5 block truncate text-[8px] font-normal text-[var(--muted)]">{currentUser.email}</span></DropdownMenuLabel><DropdownMenuSeparator /><DropdownMenuItem asChild><Link href="/console"><LayoutDashboard className="text-[var(--brand)]" />开发者控制台</Link></DropdownMenuItem><DropdownMenuItem asChild><Link href="/console/settings"><Settings />账号与企业设置</Link></DropdownMenuItem>{currentUser.platformRole === "ADMIN" && <DropdownMenuItem asChild><Link href="/admin"><ShieldCheck className="text-[var(--accent)]" />平台运营后台</Link></DropdownMenuItem>}<DropdownMenuSeparator /><DropdownMenuItem onSelect={logout} disabled={loggingOut} className="text-[var(--danger)] focus:text-[var(--danger)]"><LogOut />{loggingOut ? "正在退出" : "退出登录"}</DropdownMenuItem></DropdownMenuContent>
            </DropdownMenu> : <><Button asChild variant="ghost" size="sm" className="ml-1"><Link href="/login">登录</Link></Button><Button asChild size="sm"><Link href="/register">免费注册</Link></Button></>}
          </div>

          <Button type="button" variant="ghost" size="icon" className="ml-auto md:hidden" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={open ? "关闭导航菜单" : "打开导航菜单"}>{open ? <X /> : <Menu />}</Button>
        </div>

        {open && <nav className="container-shell grid gap-1 border-t border-[var(--line)] py-3 md:hidden" aria-label="移动端主导航">{links.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className={cn("flex h-11 items-center gap-3 rounded-[7px] px-3 text-[11px] font-medium transition hover:bg-[var(--surface-subtle)]", active && "bg-[var(--brand-soft)] text-[var(--brand-strong)]")}><item.icon className="size-4" />{item.label}</Link>;
        })}{currentUser ? <div className="mt-2 border-t border-[var(--line)] pt-3"><div className="flex items-center gap-2 px-2 pb-2"><Avatar><AvatarFallback>{initials}</AvatarFallback></Avatar><span className="min-w-0"><strong className="block truncate text-[10px]">{currentUser.name}</strong><small className="block truncate text-[8px] text-[var(--muted)]">{currentUser.email}</small></span><ThemeToggle className="ml-auto grid size-9 place-items-center rounded-[7px] border border-[var(--line)] text-[var(--muted)]" /></div><div className="grid grid-cols-2 gap-1"><MobileAccountLink href="/console" icon={LayoutDashboard} label="控制台" close={() => setOpen(false)} />{currentUser.platformRole === "ADMIN" && <MobileAccountLink href="/admin" icon={ShieldCheck} label="运营后台" close={() => setOpen(false)} />}<MobileAccountLink href="/console/settings" icon={Settings} label="账号设置" close={() => setOpen(false)} /><button type="button" onClick={logout} disabled={loggingOut} className="flex h-10 items-center gap-2 rounded-[7px] px-2 text-left text-[10px] text-[var(--danger)] transition hover:bg-[var(--danger-soft)] disabled:opacity-50"><LogOut className="size-3.5" />退出登录</button></div></div> : <div className="mt-2 flex items-center gap-2 border-t border-[var(--line)] pt-3"><ThemeToggle className="grid size-10 place-items-center rounded-[7px] border border-[var(--line)] text-[var(--muted)]" /><Button asChild variant="secondary" className="flex-1"><Link href="/login" onClick={() => setOpen(false)}>登录</Link></Button><Button asChild className="flex-1"><Link href="/register" onClick={() => setOpen(false)}>免费注册</Link></Button></div>}</nav>}
      </div>
    </header>
  </TooltipProvider>;
}

function MobileAccountLink({ href, icon: Icon, label, close }: { href: string; icon: typeof LayoutDashboard; label: string; close: () => void }) {
  return <Link href={href} onClick={close} className="flex h-10 items-center gap-2 rounded-[7px] px-2 text-[10px] transition hover:bg-[var(--surface-subtle)]"><Icon className="size-3.5" />{label}</Link>;
}
