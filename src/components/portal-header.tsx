"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, BookOpen, Boxes, CreditCard, LayoutDashboard, Menu, Search, X } from "lucide-react";
import { useState } from "react";
import { BrandMark } from "./brand-mark";
import { StatusRail } from "./status-rail";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "API 市场", icon: Boxes },
  { href: "/docs", label: "接入文档", icon: BookOpen },
  { href: "/pricing", label: "价格方案", icon: CreditCard },
  { href: "/console", label: "开发者控制台", icon: LayoutDashboard },
];

export function PortalHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40">
      <StatusRail />
      <div className="border-b border-[var(--line)] bg-white/95 backdrop-blur">
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
                    active && "text-[var(--ink)] after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-[var(--brand)]",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto hidden items-center gap-2 sm:flex">
            <button className="grid size-9 place-items-center rounded-[5px] text-[var(--muted)] hover:bg-[var(--surface-subtle)]" aria-label="搜索">
              <Search className="size-4" />
            </button>
            <button className="relative grid size-9 place-items-center rounded-[5px] text-[var(--muted)] hover:bg-[var(--surface-subtle)]" aria-label="通知">
              <Bell className="size-4" />
              <span className="absolute right-2 top-2 size-1.5 rounded-full bg-[var(--warning)]" />
            </button>
            <Link href="/login" className="ml-1 px-2 py-2 text-[12px] font-semibold text-[var(--muted)] hover:text-[var(--ink)]">登录</Link>
            <Link href="/register" className="rounded-[5px] bg-[var(--brand)] px-4 py-2 text-[12px] font-semibold text-white hover:bg-[var(--brand-strong)]">免费注册</Link>
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
            <div className="mt-2 grid grid-cols-2 gap-2 border-t border-[var(--line)] pt-3"><Link href="/login" onClick={() => setOpen(false)} className="flex h-10 items-center justify-center rounded-[4px] border border-[var(--line)] text-[11px] font-semibold">登录</Link><Link href="/register" onClick={() => setOpen(false)} className="flex h-10 items-center justify-center rounded-[4px] bg-[var(--brand)] text-[11px] font-semibold text-white">免费注册</Link></div>
          </nav>
        )}
      </div>
    </header>
  );
}
