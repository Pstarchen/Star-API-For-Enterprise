"use client";

import { Activity, AppWindow, CreditCard, Gauge, KeyRound, Settings, Webhook } from "lucide-react";
import { WorkspaceShell, type WorkspaceNavItem } from "@/components/workspace-shell";

const nav: WorkspaceNavItem[] = [
  { href: "/console", label: "工作台", icon: Gauge },
  { href: "/console/apps", label: "应用与密钥", icon: AppWindow },
  { href: "/console/logs", label: "调用日志", icon: Activity },
  { href: "/console/webhooks", label: "Webhook", icon: Webhook },
  { href: "/console/billing", label: "账单与配额", icon: CreditCard },
  { href: "/console/settings", label: "企业设置", icon: Settings },
  { href: "/console/access", label: "访问控制", icon: KeyRound },
];

export default function ConsoleLayout({ children }: LayoutProps<"/console">) {
  return <WorkspaceShell nav={nav} title="开发者控制台">{children}</WorkspaceShell>;
}
