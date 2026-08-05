import { AdminUsersManager } from "@/components/admin-users-manager";
import { prisma } from "@/lib/server/prisma";
import type { AdminUserView } from "@/lib/users";
import { connection } from "next/server";

export default async function AdminUsersPage() {
  await connection();
  const records = await prisma.user.findMany({ include: { memberships: { include: { tenant: true } } }, orderBy: { createdAt: "desc" } });
  const users: AdminUserView[] = await Promise.all(records.map(async (user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    accountType: user.accountType,
    platformRole: user.platformRole,
    status: user.status,
    workspaces: user.memberships.map((membership) => membership.tenant.name),
    calls: await prisma.requestLog.count({ where: { app: { tenantId: { in: user.memberships.map((membership) => membership.tenantId) } } } }),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  })));
  return <AdminUsersManager initialUsers={users} />;
}
