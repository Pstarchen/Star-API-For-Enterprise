import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/prisma";

type ReservationInput = {
  requestId: string;
  subscriptionId: string;
  appId: string;
  apiKeyId: string;
  productId: string;
  endpointId: string;
  method: string;
  publicPath: string;
  region: string;
};

type LockedSubscription = {
  id: string;
  status: "ACTIVE" | "PAUSED" | "CANCELED";
  quotaMonthly: bigint;
};

function monthStart() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function dayStart() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function monthPeriod() {
  const start = monthStart();
  return `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
}

function dayPeriod() {
  return dayStart().toISOString().slice(0, 10);
}

async function usageCounter(
  transaction: Prisma.TransactionClient,
  input: { id: string; subscriptionId: string; endpointId: string | null; scope: "MONTH" | "DAY"; period: string; baseline: () => Promise<number> },
) {
  let counter = await transaction.apiUsageCounter.findUnique({ where: { id: input.id }, select: { used: true } });
  if (!counter) {
    const baseline = BigInt(await input.baseline());
    counter = await transaction.apiUsageCounter.create({
      data: { id: input.id, subscriptionId: input.subscriptionId, endpointId: input.endpointId, scope: input.scope, period: input.period, used: baseline },
      select: { used: true },
    });
  }
  return counter;
}

export async function reserveGatewayUsage(input: ReservationInput) {
  return prisma.$transaction(async (transaction) => {
    const subscriptions = await transaction.$queryRaw<LockedSubscription[]>(
      Prisma.sql`SELECT "id", "status", "quotaMonthly" FROM "Subscription" WHERE "id" = ${input.subscriptionId} FOR UPDATE`,
    );
    const subscription = subscriptions[0];
    if (!subscription || subscription.status !== "ACTIVE") return { allowed: false as const, reason: "SUBSCRIPTION_INACTIVE" as const };

    const endpoint = await transaction.endpoint.findUnique({ where: { id: input.endpointId }, select: { id: true, dailyLimit: true, requestLogging: true } });
    if (!endpoint) return { allowed: false as const, reason: "ENDPOINT_MISSING" as const };

    const month = monthPeriod();
    const monthlyId = `month:${input.subscriptionId}:${month}`;
    const monthly = await usageCounter(transaction, {
      id: monthlyId,
      subscriptionId: input.subscriptionId,
      endpointId: null,
      scope: "MONTH",
      period: month,
      baseline: () => transaction.requestLog.count({ where: { appId: input.appId, productId: input.productId, occurredAt: { gte: monthStart() } } }),
    });
    if (subscription.quotaMonthly > BigInt(0) && monthly.used >= subscription.quotaMonthly) return { allowed: false as const, reason: "MONTHLY_QUOTA_EXCEEDED" as const, monthly: { usedBefore: monthly.used, usedAfter: monthly.used } };

    const day = dayPeriod();
    const dailyId = `day:${input.subscriptionId}:${input.endpointId}:${day}`;
    const daily = await usageCounter(transaction, {
      id: dailyId,
      subscriptionId: input.subscriptionId,
      endpointId: input.endpointId,
      scope: "DAY",
      period: day,
      baseline: () => transaction.requestLog.count({ where: { appId: input.appId, endpointId: input.endpointId, occurredAt: { gte: dayStart() } } }),
    });
    if (endpoint.dailyLimit > BigInt(0) && daily.used >= endpoint.dailyLimit) return { allowed: false as const, reason: "DAILY_LIMIT_EXCEEDED" as const, monthly: { usedBefore: monthly.used, usedAfter: monthly.used }, daily: { usedBefore: daily.used, usedAfter: daily.used } };

    await Promise.all([
      transaction.apiUsageCounter.update({ where: { id: monthlyId }, data: { used: { increment: 1 } } }),
      transaction.apiUsageCounter.update({ where: { id: dailyId }, data: { used: { increment: 1 } } }),
    ]);

    await transaction.requestLog.create({
      data: {
        id: input.requestId,
        appId: input.appId,
        apiKeyId: input.apiKeyId,
        productId: input.productId,
        endpointId: input.endpointId,
        method: input.method,
        path: endpoint.requestLogging ? input.publicPath : "[redacted]",
        statusCode: 102,
        latencyMs: 0,
        region: input.region,
        errorCode: "REQUEST_IN_PROGRESS",
      },
    });
    return {
      allowed: true as const,
      monthly: { usedBefore: monthly.used, usedAfter: monthly.used + BigInt(1) },
      daily: { usedBefore: daily.used, usedAfter: daily.used + BigInt(1) },
    };
  });
}
