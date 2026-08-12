import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/server/auth";
import { isInstalled } from "@/lib/server/installation";
import { PortalHeader } from "./portal-header";
import { prisma } from "@/lib/server/prisma";

export async function PortalShell({ children, overlayHeader = false }: { children: React.ReactNode; overlayHeader?: boolean }) {
  await connection();
  if (!(await isInstalled())) redirect("/install");
  const user = await getCurrentUser();
  const now = new Date();
  const since = new Date(now.getTime() - 5 * 60 * 1000);
  const [calls, successes, latency] = await Promise.all([
    prisma.requestLog.count({ where: { occurredAt: { gte: since } } }),
    prisma.requestLog.count({ where: { occurredAt: { gte: since }, statusCode: { gte: 200, lt: 400 } } }),
    prisma.requestLog.aggregate({ where: { occurredAt: { gte: since } }, _avg: { latencyMs: true } }),
  ]);
  return (
    <div className="min-h-screen">
      <PortalHeader currentUser={user ? { name: user.name, email: user.email, platformRole: user.platformRole } : null} gatewayStatus={{ calls, successRate: calls ? Number(((successes / calls) * 100).toFixed(2)) : null, averageLatency: latency._avg.latencyMs == null ? null : Math.round(latency._avg.latencyMs) }} overlay={overlayHeader} />
      <main className={overlayHeader ? "portal-main-overlay" : "portal-main-underlay"}>{children}</main>
    </div>
  );
}
