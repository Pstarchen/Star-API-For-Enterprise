import "server-only";

import { routePatternKey } from "@/lib/api-routes";
import { prisma } from "@/lib/server/prisma";

export type RouteIdentity = {
  publicHost: string;
  publicPath: string;
  routeVersion: string;
  method: string;
  excludeEndpointId?: string;
};

export async function findRouteConflict(route: RouteIdentity) {
  const candidates = await prisma.endpoint.findMany({
    where: {
      publicHost: route.publicHost,
      routeVersion: route.routeVersion,
      ...(route.method === "ALL" ? {} : { method: { in: [route.method, "ALL"] } }),
      ...(route.excludeEndpointId ? { id: { not: route.excludeEndpointId } } : {}),
    },
    select: {
      id: true,
      method: true,
      publicPath: true,
      version: { select: { product: { select: { id: true, name: true, slug: true } } } },
    },
  });
  const pattern = routePatternKey(route.publicPath);
  return candidates.find((candidate) => routePatternKey(candidate.publicPath) === pattern) ?? null;
}

export async function findSlugConflict(slug: string) {
  return prisma.apiProduct.findUnique({ where: { slug }, select: { id: true, name: true, slug: true } });
}
