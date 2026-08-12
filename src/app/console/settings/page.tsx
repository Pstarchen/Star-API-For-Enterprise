import { connection } from "next/server";
import { SettingsForm } from "@/components/settings-form";
import { getCurrentUser, getCurrentWorkspace } from "@/lib/server/auth";

export default async function SettingsPage() {
  await connection();
  const user = await getCurrentUser(); const workspace = user ? await getCurrentWorkspace(user) : null;
  if (!workspace) return <p className="text-[11px] text-[var(--muted)]">当前账号没有工作区</p>;
  return <SettingsForm settings={{ name: workspace.tenant.name, type: workspace.tenant.type, creditCode: workspace.tenant.creditCode, notificationEmail: workspace.tenant.notificationEmail, timezone: workspace.tenant.timezone, quotaAlerts: workspace.tenant.quotaAlerts, balanceAlerts: workspace.tenant.balanceAlerts, canManage: ["OWNER", "ADMIN"].includes(workspace.role) }} />;
}
