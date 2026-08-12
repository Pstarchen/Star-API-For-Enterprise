import { connection } from "next/server";
import { AdminWalletManager, type WalletTenantView } from "@/components/admin-wallet-manager";
import { prisma } from "@/lib/server/prisma";

export default async function AdminWalletPage() {
  await connection();
  const tenants = await prisma.tenant.findMany({
    include: { memberships: { include: { user: { select: { id: true, name: true, email: true } } } }, walletEntries: { orderBy: { createdAt: "desc" }, take: 8 } },
    orderBy: { updatedAt: "desc" },
  });
  const initial: WalletTenantView[] = tenants.map((tenant) => ({
    id: tenant.id,
    name: tenant.name,
    type: tenant.type,
    balance: tenant.balance.toString(),
    members: tenant.memberships.map((membership) => membership.user),
    recentEntries: tenant.walletEntries.map((entry) => ({ id: entry.id, type: entry.type, delta: entry.delta.toString(), balanceAfter: entry.balanceAfter.toString(), reason: entry.reason, createdAt: entry.createdAt.toISOString() })),
  }));
  return <AdminWalletManager initialTenants={initial} />;
}
