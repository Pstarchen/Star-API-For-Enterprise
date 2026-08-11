import "server-only";

import type { ApiStatus, Prisma } from "@prisma/client";
import { formatPrice, type CatalogProduct } from "@/lib/catalog";
import { getProductCallStatistics, type ProductCallStatistics } from "@/lib/server/api-statistics";
import { prisma } from "@/lib/server/prisma";

const productInclude = {
  provider: true,
  category: true,
  upstream: true,
  _count: { select: { assets: true } },
  versions: {
    orderBy: { version: "desc" as const },
    include: { endpoints: { orderBy: [{ path: "asc" as const }, { method: "asc" as const }] } },
  },
} satisfies Prisma.ApiProductInclude;

type ProductRecord = Prisma.ApiProductGetPayload<{ include: typeof productInclude }>;

function mapProduct(product: ProductRecord, stats?: ProductCallStatistics): CatalogProduct {
  const version = product.versions[0] ?? null;
  const endpoint = version?.endpoints[0] ?? null;
  const calls = stats?.calls ?? 0;
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    shortName: product.shortName,
    categoryId: product.categoryId,
    category: product.category.name,
    description: product.description,
    method: endpoint?.method ?? "GET",
    endpoint: endpoint?.publicPath ?? "/",
    publicHost: endpoint?.publicHost ?? "",
    latency: stats?.averageLatency == null ? null : Math.round(stats.averageLatency),
    uptime: calls ? Number((((stats?.successes ?? 0) / calls) * 100).toFixed(2)) : null,
    calls,
    todayCalls: stats?.todayCalls ?? 0,
    lastCalledAt: stats?.lastCalledAt ?? null,
    price: formatPrice(product.billingMode, product.unitPrice.toString(), product.freeQuotaMonthly.toString()),
    tags: product.tags,
    featured: product.featured,
    verified: Boolean(product.provider.verifiedAt),
    provider: product.provider.name,
    color: product.color,
    version: version?.version ?? null,
    sla: Number(product.sla),
    qpsLimit: product.defaultQpsLimit,
    billingMode: product.billingMode,
    unitPrice: product.unitPrice.toString(),
    freeQuotaMonthly: product.freeQuotaMonthly.toString(),
    status: product.status,
    visibility: product.visibility,
    upstreamType: product.upstream?.type ?? "BUILTIN",
    internalHandler: product.internalHandler,
    assetCount: product._count.assets,
    updatedAt: product.updatedAt.toISOString(),
    schema: endpoint?.schema ?? {},
  };
}

export async function listCatalogProducts(input: { status?: ApiStatus; limit?: number; providerId?: string } = {}) {
  const products = await prisma.apiProduct.findMany({
    where: { ...(input.status ? { status: input.status } : {}), ...(input.providerId ? { providerId: input.providerId } : {}) },
    include: productInclude,
    orderBy: [{ featured: "desc" }, { updatedAt: "desc" }],
    ...(input.limit ? { take: input.limit } : {}),
  });
  const stats = await getProductCallStatistics(products.map((item) => item.id));
  return products.map((item) => mapProduct(item, stats.get(item.id)));
}

export async function getCatalogProduct(slug: string, publishedOnly = true) {
  const product = await prisma.apiProduct.findFirst({ where: { slug, ...(publishedOnly ? { status: "PUBLISHED" } : {}) }, include: productInclude });
  if (!product) return null;
  const stats = await getProductCallStatistics([product.id]);
  return mapProduct(product, stats.get(product.id));
}
