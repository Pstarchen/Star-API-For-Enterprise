import "server-only";

import type { ApiStatus, Prisma } from "@prisma/client";
import { formatPrice, type CatalogProduct } from "@/lib/catalog";
import { prisma } from "@/lib/server/prisma";

const productInclude = {
  provider: true,
  upstream: true,
  _count: { select: { assets: true } },
  versions: {
    orderBy: { version: "desc" as const },
    include: { endpoints: { orderBy: [{ path: "asc" as const }, { method: "asc" as const }] } },
  },
} satisfies Prisma.ApiProductInclude;

type ProductRecord = Prisma.ApiProductGetPayload<{ include: typeof productInclude }>;

async function statsFor(productIds: string[]) {
  if (!productIds.length) return new Map<string, { calls: number; successes: number; latency: number | null }>();
  const [all, successful] = await Promise.all([
    prisma.requestLog.groupBy({ by: ["productId"], where: { productId: { in: productIds } }, _count: { _all: true }, _avg: { latencyMs: true } }),
    prisma.requestLog.groupBy({ by: ["productId"], where: { productId: { in: productIds }, statusCode: { gte: 200, lt: 400 } }, _count: { _all: true } }),
  ]);
  const successMap = new Map(successful.map((item) => [item.productId, item._count._all]));
  return new Map(all.map((item) => [item.productId!, { calls: item._count._all, successes: successMap.get(item.productId) ?? 0, latency: item._avg.latencyMs }]));
}

function mapProduct(product: ProductRecord, stats?: { calls: number; successes: number; latency: number | null }): CatalogProduct {
  const version = product.versions[0] ?? null;
  const endpoint = version?.endpoints[0] ?? null;
  const calls = stats?.calls ?? 0;
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    shortName: product.shortName,
    category: product.category,
    description: product.description,
    method: endpoint?.method ?? "GET",
    endpoint: endpoint?.publicPath ?? "/",
    publicHost: endpoint?.publicHost ?? "",
    latency: stats?.latency == null ? null : Math.round(stats.latency),
    uptime: calls ? Number((((stats?.successes ?? 0) / calls) * 100).toFixed(2)) : null,
    calls,
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
  const stats = await statsFor(products.map((item) => item.id));
  return products.map((item) => mapProduct(item, stats.get(item.id)));
}

export async function getCatalogProduct(slug: string, publishedOnly = true) {
  const product = await prisma.apiProduct.findFirst({ where: { slug, ...(publishedOnly ? { status: "PUBLISHED" } : {}) }, include: productInclude });
  if (!product) return null;
  const stats = await statsFor([product.id]);
  return mapProduct(product, stats.get(product.id));
}
