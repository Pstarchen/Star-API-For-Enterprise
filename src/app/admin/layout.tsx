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
    prisma.paymentOrder.count({ where: { channel: "BANK_TRANSFER", status: "PENDING" } }),
    prisma.authThrottle.count({ where: { blockedUntil: { gt: new Date() } } }),
  ]);
  const nav: WorkspaceNavItem[] = [
    { href: "/admin", label: "运营概览", icon: "overview" },
    { href: "/admin/apis", label: "API 管理", icon: "boxes", ...(pendingApis ? { badge: String(pendingApis) } : {}) },
    { href: "/admin/users", label: "用户管理", icon: "user" },
    { href: "/admin/providers", label: "服务商", icon: "building", ...(pendingProviders ? { badge: String(pendingProviders) } : {}) },
    { href: "/admin/tenants", label: "企业组织", icon: "users" },
    { href: "/admin/payments", label: "支付订单", icon: "billing", ...(pendingPayments ? { badge: String(pendingPayments) } : {}) },
    { href: "/admin/risk", label: "风控中心", icon: "risk", ...(blocked ? { badge: String(blocked) } : {}) },
    { href: "/admin/audits", label: "审计日志", icon: "audits" },
    { href: "/admin/monitor", label: "网关监控", icon: "activity" },
    { href: "/admin/settings", label: "平台设置", icon: "settings" },
  ];
  return <WorkspaceShell nav={nav} title="平台运营中心" currentUser={{ name: user.name, email: user.email, workspaces: user.memberships.map((membership) => ({ id: membership.tenant.id, name: membership.tenant.name, type: membership.tenant.type, status: membership.tenant.status, role: membership.role })) }} admin>{children}</WorkspaceShell>;
}
