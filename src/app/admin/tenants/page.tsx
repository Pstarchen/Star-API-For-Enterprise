import { connection } from "next/server";
import { AdminTenantsManager } from "@/components/admin-tenants-manager";
import { prisma } from "@/lib/server/prisma";

export default async function TenantsPage() {
  await connection();
  const [tenants, usage] = await Promise.all([
    prisma.tenant.findMany({ include: { memberships: { select: { id: true } }, apps: { select: { id: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.requestLog.groupBy({ by: ["appId"], _count: { _all: true }, _sum: { amount: true } }),
  ]);
  const usageByApp = new Map(usage.map((item) => [item.appId, { calls: item._count._all, amount: Number(item._sum.amount ?? 0) }]));
  return <AdminTenantsManager initialTenants={tenants.map((tenant) => { const totals = tenant.apps.reduce((sum, app) => { const item = usageByApp.get(app.id); return { calls: sum.calls + (item?.calls ?? 0), amount: sum.amount + (item?.amount ?? 0) }; }, { calls: 0, amount: 0 }); return { id: tenant.id, name: tenant.name, type: tenant.type, plan: tenant.plan, memberCount: tenant.memberships.length, appCount: tenant.apps.length, calls: totals.calls, amount: totals.amount.toFixed(6), status: tenant.status, createdAt: tenant.createdAt.toISOString() }; })} />;
}
