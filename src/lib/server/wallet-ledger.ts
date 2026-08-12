import "server-only";

import { Prisma } from "@prisma/client";

export async function lockTenantBalance(transaction: Prisma.TransactionClient, tenantId: string) {
  const rows = await transaction.$queryRaw<Array<{ id: string; balance: Prisma.Decimal }>>(
    Prisma.sql`SELECT "id", "balance" FROM "Tenant" WHERE "id" = ${tenantId} FOR UPDATE`,
  );
  return rows[0] ?? null;
}

export async function lockPaymentOrder(transaction: Prisma.TransactionClient, orderNo: string) {
  const rows = await transaction.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT "id" FROM "PaymentOrder" WHERE "orderNo" = ${orderNo} FOR UPDATE`,
  );
  return rows[0]?.id ?? null;
}
