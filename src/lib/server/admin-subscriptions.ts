import "server-only";

import { prisma } from "@/lib/server/prisma";

export type AdminSubscriptionView = {
  id: string;
  status: "ACTIVE" | "PAUSED" | "CANCELED";
  quotaMonthly: string;
  qpsLimit: number;
  unitPrice: string;
  usageThisMonth: number;
  usageToday: number;
  createdAt: string;
  app: { id: string; name: string; environment: "TEST" | "PRODUCTION" };
  tenant: { id: string; name: string };
  product: { id: string; name: string; slug: string; defaultQpsLimit: number };
};

function periodStart(kind: "month" | "day") {
  const now = new Date();
  return kind === "month"
    ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function usageKey(appId: string, productId: string | null) {
  return `${appId}:${productId ?? ""}`;
}

export async function listAdminSubscriptions(): Promise<AdminSubscriptionView[]> {
  const [subscriptions, monthlyUsage, dailyUsage] = await Promise.all([
    prisma.subscription.findMany({
      include: {
        app: { include: { tenant: { select: { id: true, name: true } } } },
        product: { select: { id: true, name: true, slug: true, defaultQpsLimit: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.requestLog.groupBy({ by: ["appId", "productId"], where: { occurredAt: { gte: periodStart("month") } }, _count: { _all: true } }),
    prisma.requestLog.groupBy({ by: ["appId", "productId"], where: { occurredAt: { gte: periodStart("day") } }, _count: { _all: true } }),
  ]);
  const monthly = new Map(monthlyUsage.map((item) => [usageKey(item.appId, item.productId), item._count._all]));
  const daily = new Map(dailyUsage.map((item) => [usageKey(item.appId, item.productId), item._count._all]));
  return subscriptions.map((subscription) => ({
    id: subscription.id,
    status: subscription.status,
    quotaMonthly: subscription.quotaMonthly.toString(),
    qpsLimit: subscription.qpsLimit,
    unitPrice: subscription.unitPrice.toString(),
    usageThisMonth: monthly.get(usageKey(subscription.appId, subscription.productId)) ?? 0,
    usageToday: daily.get(usageKey(subscription.appId, subscription.productId)) ?? 0,
    createdAt: subscription.createdAt.toISOString(),
    app: { id: subscription.app.id, name: subscription.app.name, environment: subscription.app.environment },
    tenant: subscription.app.tenant,
    product: subscription.product,
  }));
}
