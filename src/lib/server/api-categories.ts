import "server-only";

import { prisma } from "@/lib/server/prisma";

export async function listApiCategories(includeDisabled = false) {
  const categories = await prisma.apiCategory.findMany({
    where: includeDisabled ? undefined : { enabled: true },
    include: { _count: { select: { products: true } } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    description: category.description,
    sortOrder: category.sortOrder,
    enabled: category.enabled,
    productCount: category._count.products,
  }));
}

export async function requireEnabledApiCategory(id: string) {
  return prisma.apiCategory.findFirst({ where: { id, enabled: true } });
}
