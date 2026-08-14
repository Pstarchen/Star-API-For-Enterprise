import { connection } from "next/server";
import { LocalTime } from "@/components/local-time";
import { ResourceTablePage } from "@/components/resource-table-page";
import { prisma } from "@/lib/server/prisma";

export default async function RiskPage() {
  await connection();
  const blocked = await prisma.authThrottle.findMany({ where: { blockedUntil: { gt: new Date() } }, orderBy: { blockedUntil: "desc" } });
  return <ResourceTablePage eyebrow="RISK CONTROL" title="实时登录风控" description="展示登录节流器当前真实阻断记录；标识已哈希，无法反查邮箱或 IP。" columns={["风险标识哈希", "失败次数", "窗口开始", "阻断至", "更新时间"]} rows={blocked.map((item) => [<code key="key" className="mono">{item.key}</code>, item.attempts, <LocalTime key="window" value={item.windowStartedAt} />, item.blockedUntil ? <LocalTime key="blocked" value={item.blockedUntil} /> : "-", <LocalTime key="updated" value={item.updatedAt} />])} emptyText="当前没有被阻断的登录标识" />;
}
