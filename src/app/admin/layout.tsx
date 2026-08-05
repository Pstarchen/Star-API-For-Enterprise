import { WorkspaceShell, type WorkspaceNavItem } from "@/components/workspace-shell";
import { requireAdmin } from "@/lib/server/auth";
import { connection } from "next/server";
const nav: WorkspaceNavItem[] = [
  { href: "/admin", label: "运营概览", icon: "overview" },
  { href: "/admin/apis", label: "API 管理", icon: "boxes", badge: "8" },
  { href: "/admin/users", label: "用户管理", icon: "user" },
  { href: "/admin/providers", label: "服务商准入", icon: "building", badge: "3" },
  { href: "/admin/tenants", label: "企业组织", icon: "users" },
  { href: "/admin/risk", label: "风控中心", icon: "risk", badge: "2" },
  { href: "/admin/audits", label: "审计日志", icon: "audits" },
  { href: "/admin/monitor", label: "网关监控", icon: "activity" },
  { href: "/admin/settings", label: "平台设置", icon: "settings" },
];
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await connection();
  const user = await requireAdmin();
  return <WorkspaceShell nav={nav} title="平台运营中心" currentUser={{ name: user.name, email: user.email, workspaces: user.memberships.map((membership) => ({ id: membership.tenant.id, name: membership.tenant.name, type: membership.tenant.type, status: membership.tenant.status, role: membership.role })) }} admin>{children}</WorkspaceShell>;
}
