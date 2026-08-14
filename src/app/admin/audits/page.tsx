import { connection } from "next/server";
import { LocalTime } from "@/components/local-time";
import { ResourceTablePage } from "@/components/resource-table-page";
import { prisma } from "@/lib/server/prisma";

export default async function AuditsPage() {
  await connection();
  const logs = await prisma.auditLog.findMany({ include: { actor: true, tenant: true }, orderBy: { occurredAt: "desc" }, take: 200 });
  return <ResourceTablePage eyebrow="AUDIT TRAIL" title="审计日志" description="只读展示最近 200 条真实高权限与业务变更记录。" columns={["时间", "操作人", "动作", "资源", "资源 ID", "工作区", "来源 IP"]} rows={logs.map((log) => [<LocalTime key="time" value={log.occurredAt} />, log.actor?.name ?? "系统", log.action, log.resource, <code key="id" className="mono">{log.resourceId ?? "-"}</code>, log.tenant?.name ?? "平台级", log.ipAddress ?? "未记录"])} />;
}
