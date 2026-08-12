import { WorkspaceShell, type WorkspaceNavItem } from "@/components/workspace-shell";
import { requireAdmin } from "@/lib/server/auth";
import { connection } from "next/server";
import { prisma } from "@/lib/server/prisma";
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await connection();
  const user = await requireAdmin();
  const [pendingApis, pendingProviders, pendingPayments, blocked] = await Promise.all([
    prisma.apiProduct.count({ where: { status: { in: ["DRAFT", "REVIEW"] } } }),
    prisma.provider.count({ where: { verifiedAt: null } }),
    prisma.paymentOrder.count({ where: { channel: { in: ["BANK_TRANSFER", "CODE_PAY"] }, status: "PENDING" } }),
    prisma.authThrottle.count({ where: { blockedUntil: { gt: new Date() } } }),
  ]);
  const nav: WorkspaceNavItem[] = [
    { href: "/admin", label: "运营中心", icon: "overview", items: [
      { href: "/admin", label: "运营概览", icon: "overview", exact: true },
      { href: "/admin/monitor", label: "网关监控", icon: "activity" },
      { href: "/admin/audits", label: "审计日志", icon: "audits" },
    ] },
    { href: "/admin/apis", label: "API 开放", icon: "boxes", ...(pendingApis ? { badge: String(pendingApis) } : {}), items: [
      { href: "/admin/apis", label: "API 管理", icon: "boxes" },
      { href: "/admin/testing", label: "调试与密钥", icon: "apps" },
    ] },
    { href: "/admin/users", label: "客户与服务商", icon: "users", ...(pendingProviders ? { badge: String(pendingProviders) } : {}), items: [
      { href: "/admin/users", label: "用户管理", icon: "user" },
      { href: "/admin/providers", label: "服务商审核", icon: "building" },
      { href: "/admin/tenants", label: "企业组织", icon: "users" },
    ] },
    { href: "/admin/payments", label: "财务与风控", icon: "billing", ...((pendingPayments + blocked) ? { badge: String(pendingPayments + blocked) } : {}), items: [
      { href: "/admin/payments", label: "支付订单", icon: "billing" },
      { href: "/admin/wallet", label: "余额与退款", icon: "billing" },
      { href: "/admin/risk", label: "风控中心", icon: "risk" },
    ] },
    { href: "/admin/settings", label: "平台设置", icon: "settings", items: [
      { href: "/admin/settings", label: "基础设置", icon: "settings", exact: true },
      { href: "/admin/settings/auth", label: "登录策略", icon: "access" },
      { href: "/admin/settings/integrations", label: "登录与邮件", icon: "webhooks" },
      { href: "/admin/settings/payments", label: "支付设置", icon: "billing" },
    ] },
  ];
  return <WorkspaceShell nav={nav} title="平台运营中心" currentUser={{ name: user.name, email: user.email, workspaces: user.memberships.map((membership) => ({ id: membership.tenant.id, name: membership.tenant.name, type: membership.tenant.type, status: membership.tenant.status, role: membership.role })) }} admin>{children}</WorkspaceShell>;
}
