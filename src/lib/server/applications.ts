import "server-only";

import { Prisma } from "@prisma/client";
import type { ApplicationView } from "@/lib/applications";
import { prisma } from "@/lib/server/prisma";

const include = {
  apiKeys: { orderBy: { createdAt: "desc" as const } },
  subscriptions: { include: { product: true }, orderBy: { createdAt: "desc" as const } },
  requestLogs: { select: { amount: true } },
} satisfies Prisma.ApplicationInclude;

type Record = Prisma.ApplicationGetPayload<{ include: typeof include }>;

export function mapApplication(app: Record): ApplicationView {
  return {
    id: app.id,
    name: app.name,
    environment: app.environment,
    status: app.status,
    createdAt: app.createdAt.toISOString(),
    calls: app.requestLogs.length,
    cost: app.requestLogs.reduce((sum, log) => sum.plus(log.amount), new Prisma.Decimal(0)).toString(),
    keys: app.apiKeys.map((key) => ({ id: key.id, name: key.name, prefix: key.prefix, status: key.status, lastUsedAt: key.lastUsedAt?.toISOString() ?? null, createdAt: key.createdAt.toISOString() })),
    subscriptions: app.subscriptions.map((item) => ({ id: item.id, productId: item.productId, productName: item.product.name, status: item.status, quotaMonthly: item.quotaMonthly.toString(), qpsLimit: item.qpsLimit, unitPrice: item.unitPrice.toString() })),
  };
}

export async function listApplications(tenantId: string) {
  const apps = await prisma.application.findMany({ where: { tenantId }, include, orderBy: { createdAt: "desc" } });
  return apps.map(mapApplication);
}

export async function getApplication(id: string) {
  const app = await prisma.application.findUnique({ where: { id }, include });
  return app ? mapApplication(app) : null;
}
