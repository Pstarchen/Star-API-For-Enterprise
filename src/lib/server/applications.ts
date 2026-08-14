import "server-only";

import { Prisma } from "@prisma/client";
import type { ApplicationView } from "@/lib/applications";
import { revealDirectLinkToken } from "@/lib/server/direct-link";
import { prisma } from "@/lib/server/prisma";

const include = {
  apiKeys: { orderBy: { createdAt: "desc" as const } },
  subscriptions: {
    include: {
      product: {
        include: {
          versions: {
            orderBy: { version: "desc" as const },
            include: { endpoints: { include: { parameters: { orderBy: { name: "asc" as const } } }, orderBy: { publicPath: "asc" as const } } },
          },
        },
      },
      directLinks: { include: { endpoint: true }, orderBy: { createdAt: "desc" as const } },
    },
    orderBy: { createdAt: "desc" as const },
  },
  requestLogs: { select: { amount: true } },
} satisfies Prisma.ApplicationInclude;

type Record = Prisma.ApplicationGetPayload<{ include: typeof include }>;

export function mapApplication(app: Record): ApplicationView {
  const now = new Date();
  return {
    id: app.id,
    name: app.name,
    environment: app.environment,
    status: app.status,
    createdAt: app.createdAt.toISOString(),
    calls: app.requestLogs.length,
    cost: app.requestLogs.reduce((sum, log) => sum.plus(log.amount), new Prisma.Decimal(0)).toString(),
    keys: app.apiKeys.map((key) => ({ id: key.id, name: key.name, prefix: key.prefix, status: key.status, lastUsedAt: key.lastUsedAt?.toISOString() ?? null, createdAt: key.createdAt.toISOString() })),
    subscriptions: app.subscriptions.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.product.name,
      status: item.status,
      quotaMonthly: item.quotaMonthly.toString(),
      qpsLimit: item.qpsLimit,
      unitPrice: item.unitPrice.toString(),
      endpoints: (item.product.versions[0]?.endpoints ?? [])
        .filter((endpoint) => endpoint.methods.includes("GET") || endpoint.methods.includes("ALL"))
        .map((endpoint) => ({ id: endpoint.id, methods: endpoint.methods, publicPath: endpoint.publicPath, routeVersion: endpoint.routeVersion, summary: endpoint.summary, parameters: endpoint.parameters.map((parameter) => ({ id: parameter.id, location: parameter.location, name: parameter.name, required: parameter.required, dataType: parameter.dataType, description: parameter.description, defaultValue: parameter.defaultValue })) })),
    })),
    directLinks: app.subscriptions.flatMap((subscription) => subscription.directLinks.map((link) => {
      const token = revealDirectLinkToken(link.tokenEncrypted);
      const configured = link.defaultParameters && typeof link.defaultParameters === "object" && !Array.isArray(link.defaultParameters)
        ? Object.fromEntries(Object.entries(link.defaultParameters).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
        : {};
      const status = link.status === "ACTIVE" && link.expiresAt && link.expiresAt <= now ? "EXPIRED" : link.status;
      return { id: link.id, subscriptionId: subscription.id, endpointId: link.endpointId, name: link.name, productName: subscription.product.name, publicPath: link.endpoint.publicPath, routeVersion: link.endpoint.routeVersion, path: token ? `/l/${token}` : null, prefix: link.prefix, defaultParameters: configured, status, expiresAt: link.expiresAt?.toISOString() ?? null, lastUsedAt: link.lastUsedAt?.toISOString() ?? null, createdAt: link.createdAt.toISOString() };
    })),
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
