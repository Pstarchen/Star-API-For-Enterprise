"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, Boxes, ChevronDown, CreditCard, Home, LayoutDashboard, LogOut, Menu, Settings, ShieldCheck, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BrandMark } from "./brand-mark";
import { StatusRail, type GatewayStatus } from "./status-rail";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";

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
  const [accountOpen, setAccountOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function closeAccount(event: PointerEvent) {
      if (!accountRef.current?.contains(event.target as Node)) setAccountOpen(false);
    }
    function closeMenus(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setAccountOpen(false);
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", closeAccount);
    document.addEventListener("keydown", closeMenus);
    return () => {
      document.removeEventListener("pointerdown", closeAccount);
      document.removeEventListener("keydown", closeMenus);
    };
  }, []);

  async function logout() {
    setLoggingOut(true);
    await fetch("/api/v1/auth/logout", { method: "POST" }).catch(() => undefined);
    setAccountOpen(false);
    setOpen(false);
    router.push("/");
    router.refresh();
  }

  const initials = currentUser?.name.slice(0, 1).toUpperCase();

  return (
    <header className="sticky top-0 z-40">
      <StatusRail status={gatewayStatus} />
      <div className="portal-glass">
        <div className="container-shell flex h-16 items-center gap-7">
          <BrandMark />
          <nav className="hidden h-full items-center gap-1 md:flex" aria-label="主导航">
            {links.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "relative flex h-full items-center px-3 text-[13px] font-medium text-[var(--muted)] hover:text-[var(--ink)]",
                    active && "text-[var(--ink)] after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-[var(--aqua)] after:shadow-[0_0_12px_var(--aqua)]",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div ref={accountRef} className="relative ml-auto hidden items-center gap-2 sm:flex">
            <ThemeToggle className="grid size-9 place-items-center rounded-[5px] text-[var(--muted)] hover:bg-[var(--surface-subtle)]" />
            {currentUser ? <>
              <button type="button" onClick={() => setAccountOpen((value) => !value)} className="ml-1 flex h-10 max-w-48 items-center gap-2 rounded-[6px] border border-[var(--line)] bg-[var(--surface)] px-2.5 text-left hover:border-[var(--line-strong)]" aria-expanded={accountOpen} aria-haspopup="menu">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--brand)] text-[10px] font-bold text-white">{initials}</span>
                <span className="min-w-0"><strong className="block truncate text-[10px]">{currentUser.name}</strong><small className="block text-[8px] text-[var(--muted)]">{currentUser.platformRole === "ADMIN" ? "平台管理员" : "开发者账号"}</small></span>
                <ChevronDown className={cn("size-3.5 shrink-0 text-[var(--muted)] transition-transform", accountOpen && "rotate-180")} />
              </button>
              {accountOpen && <div role="menu" className="absolute right-0 top-12 z-50 w-64 overflow-hidden rounded-[8px] border border-[var(--line)] bg-[var(--surface)] p-2 shadow-[var(--shadow-md)]">
                <div className="border-b border-[var(--line)] px-2 py-2.5"><strong className="block truncate text-[11px]">{currentUser.name}</strong><span className="mt-0.5 block truncate text-[9px] text-[var(--muted)]">{currentUser.email}</span></div>
                <div className="py-1">
                  <Link href="/console" onClick={() => setAccountOpen(false)} role="menuitem" className="flex h-9 items-center gap-2.5 rounded-[5px] px-2 text-[10px] hover:bg-[var(--surface-subtle)]"><LayoutDashboard className="size-3.5 text-[var(--brand)]" />开发者控制台</Link>
                  <Link href="/console/settings" onClick={() => setAccountOpen(false)} role="menuitem" className="flex h-9 items-center gap-2.5 rounded-[5px] px-2 text-[10px] hover:bg-[var(--surface-subtle)]"><Settings className="size-3.5 text-[var(--muted)]" />账号与企业设置</Link>
                  {currentUser.platformRole === "ADMIN" && <Link href="/admin" onClick={() => setAccountOpen(false)} role="menuitem" className="flex h-9 items-center gap-2.5 rounded-[5px] px-2 text-[10px] hover:bg-[var(--surface-subtle)]"><ShieldCheck className="size-3.5 text-[var(--accent)]" />平台运营后台</Link>}
                </div>
                <button type="button" onClick={logout} disabled={loggingOut} role="menuitem" className="flex h-9 w-full items-center gap-2.5 border-t border-[var(--line)] px-2 text-left text-[10px] text-[var(--danger)] hover:bg-[var(--danger-soft)] disabled:opacity-50"><LogOut className="size-3.5" />{loggingOut ? "正在退出" : "退出登录"}</button>
              </div>}
            </> : <>
              <Link href="/login" className="ml-1 px-2 py-2 text-[12px] font-semibold text-[var(--muted)] hover:text-[var(--ink)]">登录</Link>
              <Link href="/register" className="luminous-button rounded-[5px] bg-[var(--brand)] px-4 py-2 text-[12px] font-semibold text-white hover:bg-[var(--brand-strong)]">免费注册</Link>
            </>}
          </div>
          <button className="ml-auto grid size-9 place-items-center md:hidden" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label="打开导航菜单">
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
        {open && (
          <nav className="container-shell grid gap-1 border-t border-[var(--line)] py-3 md:hidden" aria-label="移动端主导航">
            {links.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-[5px] px-3 py-3 font-medium hover:bg-[var(--surface-subtle)]">
                <item.icon className="size-4 text-[var(--muted)]" /> {item.label}
              </Link>
            ))}
            {currentUser ? <div className="mt-2 border-t border-[var(--line)] pt-3">
              <div className="flex items-center gap-2 px-2 pb-2"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--brand)] text-[10px] font-bold text-white">{initials}</span><span className="min-w-0"><strong className="block truncate text-[10px]">{currentUser.name}</strong><small className="block truncate text-[8px] text-[var(--muted)]">{currentUser.email}</small></span><ThemeToggle className="ml-auto grid size-9 place-items-center rounded-[5px] border border-[var(--line)] text-[var(--muted)]" /></div>
              <div className="grid grid-cols-2 gap-1"><Link href="/console" onClick={() => setOpen(false)} className="flex h-10 items-center gap-2 rounded-[5px] px-2 text-[10px] hover:bg-[var(--surface-subtle)]"><LayoutDashboard className="size-3.5" />控制台</Link>{currentUser.platformRole === "ADMIN" && <Link href="/admin" onClick={() => setOpen(false)} className="flex h-10 items-center gap-2 rounded-[5px] px-2 text-[10px] hover:bg-[var(--surface-subtle)]"><ShieldCheck className="size-3.5" />运营后台</Link>}<Link href="/console/settings" onClick={() => setOpen(false)} className="flex h-10 items-center gap-2 rounded-[5px] px-2 text-[10px] hover:bg-[var(--surface-subtle)]"><Settings className="size-3.5" />账号设置</Link><button type="button" onClick={logout} disabled={loggingOut} className="flex h-10 items-center gap-2 rounded-[5px] px-2 text-left text-[10px] text-[var(--danger)] hover:bg-[var(--danger-soft)] disabled:opacity-50"><LogOut className="size-3.5" />退出登录</button></div>
            </div> : <div className="mt-2 flex items-center gap-2 border-t border-[var(--line)] pt-3"><ThemeToggle className="grid size-10 place-items-center rounded-[4px] border border-[var(--line)] text-[var(--muted)]" /><Link href="/login" onClick={() => setOpen(false)} className="flex h-10 flex-1 items-center justify-center rounded-[4px] border border-[var(--line)] text-[11px] font-semibold">登录</Link><Link href="/register" onClick={() => setOpen(false)} className="flex h-10 flex-1 items-center justify-center rounded-[4px] bg-[var(--brand)] text-[11px] font-semibold text-white">免费注册</Link></div>}
          </nav>
        )}
      </div>
    </header>
  );
}
