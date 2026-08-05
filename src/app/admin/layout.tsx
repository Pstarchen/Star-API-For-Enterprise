"use client";
import { Activity, Boxes, Building2, Gauge, ScrollText, Settings, ShieldCheck, UserRound, Users } from "lucide-react";
import { WorkspaceShell, type WorkspaceNavItem } from "@/components/workspace-shell";
const nav: WorkspaceNavItem[] = [
  { href: "/admin", label: "运营概览", icon: Gauge },
  { href: "/admin/apis", label: "API 管理", icon: Boxes, badge: "8" },
  { href: "/admin/users", label: "用户管理", icon: UserRound },
  { href: "/admin/providers", label: "服务商准入", icon: Building2, badge: "3" },
  { href: "/admin/tenants", label: "企业组织", icon: Users },
  { href: "/admin/risk", label: "风控中心", icon: ShieldCheck, badge: "2" },
  { href: "/admin/audits", label: "审计日志", icon: ScrollText },
  { href: "/admin/monitor", label: "网关监控", icon: Activity },
  { href: "/admin/settings", label: "平台设置", icon: Settings },
];
export default function AdminLayout({ children }: LayoutProps<"/admin">) { return <WorkspaceShell nav={nav} title="平台运营中心" admin>{children}</WorkspaceShell>; }
