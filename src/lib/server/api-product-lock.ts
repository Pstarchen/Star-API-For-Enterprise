import "server-only";

import { Prisma } from "@prisma/client";

export async function lockApiProduct(transaction: Prisma.TransactionClient, productId: string) {
  const rows = await transaction.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT "id" FROM "ApiProduct" WHERE "id" = ${productId} FOR UPDATE`,
  );
  return rows[0]?.id ?? null;
}
