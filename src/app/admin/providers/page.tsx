import { connection } from "next/server";
import { AdminProvidersManager } from "@/components/admin-providers-manager";
import { prisma } from "@/lib/server/prisma";

export default async function ProvidersPage() {
  await connection();
  const providers = await prisma.provider.findMany({ include: { products: { include: { category: true } } }, orderBy: { createdAt: "desc" } });
  return <AdminProvidersManager initialProviders={providers.map((provider) => ({ id: provider.id, name: provider.name, legalName: provider.legalName, contactEmail: provider.contactEmail, productCount: provider.products.length, categories: Array.from(new Set(provider.products.map((item) => item.category.name))), averageSla: provider.products.length ? (provider.products.reduce((sum, item) => sum + Number(item.sla), 0) / provider.products.length).toFixed(3) : null, verifiedAt: provider.verifiedAt?.toISOString() ?? null, createdAt: provider.createdAt.toISOString() }))} />;
}
