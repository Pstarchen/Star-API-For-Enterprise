import "server-only";

import { methodsOverlap } from "@/lib/api-contracts";
import { routePatternKey } from "@/lib/api-routes";
import { prisma } from "@/lib/server/prisma";

export type RouteIdentity = {
  publicHost: string;
  publicPath: string;
  routeVersion: string;
  methods: string[];
  excludeEndpointId?: string;
};

export async function findRouteConflict(route: RouteIdentity) {
  const candidates = await prisma.endpoint.findMany({
    where: {
      publicHost: route.publicHost,
      routeVersion: route.routeVersion,
      ...(route.excludeEndpointId ? { id: { not: route.excludeEndpointId } } : {}),
    },
    select: {
      id: true,
      methods: true,
      publicPath: true,
      version: { select: { product: { select: { id: true, name: true, slug: true } } } },
    },
  });
  const pattern = routePatternKey(route.publicPath);
  return candidates.find((candidate) => routePatternKey(candidate.publicPath) === pattern && methodsOverlap(candidate.methods, route.methods)) ?? null;
}

export async function findSlugConflict(slug: string) {
  return prisma.apiProduct.findUnique({ where: { slug }, select: { id: true, name: true, slug: true } });
}
