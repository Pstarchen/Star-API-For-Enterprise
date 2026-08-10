import "server-only";

import { Prisma } from "@prisma/client";
import type { UsagePoint } from "@/components/usage-chart";
import { prisma } from "@/lib/server/prisma";

export type ProductCallStatistics = {
  calls: number;
  todayCalls: number;
  successes: number;
  averageLatency: number | null;
  lastCalledAt: string | null;
};

type DailyRow = { day: string; success: bigint; failed: bigint };

const chinaOffsetMs = 8 * 60 * 60 * 1000;

export function chinaDayStart(now = new Date()) {
  const shifted = new Date(now.getTime() + chinaOffsetMs);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - chinaOffsetMs);
}

export function chinaMonthStart(now = new Date()) {
  const shifted = new Date(now.getTime() + chinaOffsetMs);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1) - chinaOffsetMs);
}

export function chinaDateKey(value: Date) {
  return new Date(value.getTime() + chinaOffsetMs).toISOString().slice(0, 10);
}

export async function getProductCallStatistics(productIds: string[]) {
  if (!productIds.length) return new Map<string, ProductCallStatistics>();
  const today = chinaDayStart();
  const [all, successful, todayRows] = await Promise.all([
    prisma.requestLog.groupBy({ by: ["productId"], where: { productId: { in: productIds } }, _count: { _all: true }, _avg: { latencyMs: true }, _max: { occurredAt: true } }),
    prisma.requestLog.groupBy({ by: ["productId"], where: { productId: { in: productIds }, statusCode: { gte: 200, lt: 400 } }, _count: { _all: true } }),
    prisma.requestLog.groupBy({ by: ["productId"], where: { productId: { in: productIds }, occurredAt: { gte: today } }, _count: { _all: true } }),
  ]);
  const successMap = new Map(successful.map((item) => [item.productId, item._count._all]));
  const todayMap = new Map(todayRows.map((item) => [item.productId, item._count._all]));
  return new Map(all.map((item) => [item.productId!, {
    calls: item._count._all,
    todayCalls: todayMap.get(item.productId) ?? 0,
    successes: successMap.get(item.productId) ?? 0,
    averageLatency: item._avg.latencyMs,
    lastCalledAt: item._max.occurredAt?.toISOString() ?? null,
  }]));
}

export async function getApiOperationsStatistics() {
  const now = new Date();
  const today = chinaDayStart(now);
  const week = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);
  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
  const [apiCount, publishedApiCount, totalCalls, todayCalls, todaySuccesses, todayLatency, windowCalls, windowErrors, windowLatency, regions, dailyRows, popularRows] = await Promise.all([
    prisma.apiProduct.count(),
    prisma.apiProduct.count({ where: { status: "PUBLISHED" } }),
    prisma.requestLog.count(),
    prisma.requestLog.count({ where: { occurredAt: { gte: today } } }),
    prisma.requestLog.count({ where: { occurredAt: { gte: today }, statusCode: { gte: 200, lt: 400 } } }),
    prisma.requestLog.aggregate({ where: { occurredAt: { gte: today } }, _avg: { latencyMs: true } }),
    prisma.requestLog.count({ where: { occurredAt: { gte: fiveMinutesAgo } } }),
    prisma.requestLog.count({ where: { occurredAt: { gte: fiveMinutesAgo }, statusCode: { gte: 500 } } }),
    prisma.requestLog.aggregate({ where: { occurredAt: { gte: fiveMinutesAgo } }, _avg: { latencyMs: true } }),
    prisma.requestLog.groupBy({ by: ["region"], where: { occurredAt: { gte: fiveMinutesAgo } }, _count: { _all: true }, _avg: { latencyMs: true }, orderBy: { _count: { region: "desc" } } }),
    prisma.$queryRaw<DailyRow[]>(Prisma.sql`SELECT to_char(r."occurredAt" + interval '8 hours', 'YYYY-MM-DD') AS day, COUNT(*) FILTER (WHERE r."statusCode" >= 200 AND r."statusCode" < 400) AS success, COUNT(*) FILTER (WHERE r."statusCode" < 200 OR r."statusCode" >= 400) AS failed FROM "RequestLog" r WHERE r."occurredAt" >= ${week} GROUP BY 1 ORDER BY 1`),
    prisma.requestLog.groupBy({ by: ["productId"], where: { occurredAt: { gte: week }, productId: { not: null } }, _count: { _all: true }, _avg: { latencyMs: true }, _max: { occurredAt: true }, orderBy: { _count: { productId: "desc" } }, take: 8 }),
  ]);
  const products = await prisma.apiProduct.findMany({ where: { id: { in: popularRows.flatMap((item) => item.productId ? [item.productId] : []) } }, select: { id: true, name: true, slug: true, color: true } });
  const productMap = new Map(products.map((product) => [product.id, product]));
  const dailyMap = new Map(dailyRows.map((row) => [row.day, row]));
  const daily: UsagePoint[] = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(week.getTime() + index * 24 * 60 * 60 * 1000);
    const key = chinaDateKey(date);
    const row = dailyMap.get(key);
    const display = new Date(date.getTime() + chinaOffsetMs);
    return { date: `${display.getUTCMonth() + 1}/${display.getUTCDate()}`, success: Number(row?.success ?? 0), failed: Number(row?.failed ?? 0) };
  });
  return {
    apiCount,
    publishedApiCount,
    totalCalls,
    todayCalls,
    todaySuccessRate: todayCalls ? Number(((todaySuccesses / todayCalls) * 100).toFixed(2)) : null,
    todayAverageLatency: todayLatency._avg.latencyMs == null ? null : Math.round(todayLatency._avg.latencyMs),
    windowCalls,
    windowErrorRate: windowCalls ? Number(((windowErrors / windowCalls) * 100).toFixed(2)) : 0,
    windowAverageLatency: windowLatency._avg.latencyMs == null ? null : Math.round(windowLatency._avg.latencyMs),
    regions: regions.map((region) => ({ name: region.region, calls: region._count._all, averageLatency: region._avg.latencyMs == null ? null : Math.round(region._avg.latencyMs) })),
    daily,
    popular: popularRows.flatMap((row) => {
      const product = row.productId ? productMap.get(row.productId) : null;
      return product ? [{ ...product, calls: row._count._all, averageLatency: row._avg.latencyMs == null ? null : Math.round(row._avg.latencyMs), lastCalledAt: row._max.occurredAt?.toISOString() ?? null }] : [];
    }),
  };
}
