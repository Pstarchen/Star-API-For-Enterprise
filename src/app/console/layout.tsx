import { WorkspaceShell, type WorkspaceNavItem } from "@/components/workspace-shell";
import { requireUser } from "@/lib/server/auth";
import { connection } from "next/server";

const nav: WorkspaceNavItem[] = [
  { href: "/console", label: "工作台", icon: "overview" },
  { href: "/console/apps", label: "应用与密钥", icon: "apps" },
  { href: "/console/logs", label: "调用日志", icon: "activity" },
  { href: "/console/webhooks", label: "Webhook", icon: "webhooks" },
  { href: "/console/billing", label: "账单与配额", icon: "billing" },
  { href: "/console/settings", label: "企业设置", icon: "settings" },
  { href: "/console/access", label: "访问控制", icon: "access" },
];

export default async function ConsoleLayout({ children }: LayoutProps<"/console">) {
  await connection();
  const user = await requireUser();
  const userNav = [...nav];
  if (user.memberships.some((membership) => membership.tenant.type === "ENTERPRISE" && ["OWNER", "ADMIN"].includes(membership.role))) userNav.splice(2, 0, { href: "/console/provider/apis", label: "服务商 API", icon: "boxes" });
  return <WorkspaceShell nav={userNav} title="开发者控制台" currentUser={{ name: user.name, email: user.email, workspaces: user.memberships.map((membership) => ({ id: membership.tenant.id, name: membership.tenant.name, type: membership.tenant.type, status: membership.tenant.status, role: membership.role })) }}>{children}</WorkspaceShell>;
}
