import "server-only";

import { Prisma } from "@prisma/client";
import { decryptJson, encryptJson } from "@/lib/server/encryption";
import { normalizeEpayGatewayUrl } from "@/lib/epay";
import { epayPaymentTypes, type EpayPaymentType } from "@/lib/payment-options";
import { prisma } from "@/lib/server/prisma";
import { assertSafeUpstream } from "@/lib/server/upstream";

export type PaymentProviderInput = {
  name: string;
  gatewayUrl: string;
  merchantPid: string;
  merchantKey?: string;
  paymentTypes: EpayPaymentType[];
  feeRate: string;
  minAmount: string;
  maxAmount: string;
  sortOrder: number;
  enabled: boolean;
  description?: string;
};

export function paymentProviderView(provider: {
  id: string;
  name: string;
  gatewayUrl: string;
  merchantPid: string;
  merchantKeyEncrypted: Uint8Array;
  paymentTypes: string[];
  feeRate: Prisma.Decimal;
  minAmount: Prisma.Decimal;
  maxAmount: Prisma.Decimal;
  sortOrder: number;
  enabled: boolean;
  description: string | null;
  healthStatus: "UNKNOWN" | "HEALTHY" | "UNHEALTHY";
  lastTestedAt: Date | null;
  lastTestMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: { orders: number };
}) {
  return {
    id: provider.id,
    name: provider.name,
    gatewayUrl: provider.gatewayUrl,
    merchantPid: provider.merchantPid,
    merchantKeyConfigured: provider.merchantKeyEncrypted.length > 0,
    paymentTypes: provider.paymentTypes,
    feeRate: provider.feeRate.toString(),
    minAmount: provider.minAmount.toString(),
    maxAmount: provider.maxAmount.toString(),
    sortOrder: provider.sortOrder,
    enabled: provider.enabled,
    description: provider.description,
    healthStatus: provider.healthStatus,
    lastTestedAt: provider.lastTestedAt?.toISOString() ?? null,
    lastTestMessage: provider.lastTestMessage,
    orderCount: provider._count?.orders ?? 0,
    createdAt: provider.createdAt.toISOString(),
    updatedAt: provider.updatedAt.toISOString(),
  };
}

export function paymentProviderSecret(provider: { merchantKeyEncrypted: Uint8Array }) {
  const value = decryptJson(provider.merchantKeyEncrypted).merchantKey;
  if (typeof value !== "string" || !value) throw new Error("EPAY_KEY_UNAVAILABLE");
  return value;
}

export async function lockPaymentProvider(transaction: Prisma.TransactionClient, id: string) {
  const rows = await transaction.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT "id" FROM "PaymentProvider" WHERE "id" = ${id} FOR UPDATE`,
  );
  return rows[0]?.id ?? null;
}

export async function normalizePaymentProviderInput(input: PaymentProviderInput) {
  const name = input.name.trim();
  const gatewayUrl = normalizeEpayGatewayUrl(input.gatewayUrl.trim());
  const merchantPid = input.merchantPid.trim();
  const merchantKey = input.merchantKey?.trim();
  const description = input.description?.trim() || null;
  const paymentTypes = [...new Set(input.paymentTypes)].filter((value): value is EpayPaymentType => epayPaymentTypes.includes(value));
  const feeRate = new Prisma.Decimal(input.feeRate);
  const minAmount = new Prisma.Decimal(input.minAmount);
  const maxAmount = new Prisma.Decimal(input.maxAmount);

  if (!name || !merchantPid || !paymentTypes.length) throw new Error("EPAY_PROVIDER_INCOMPLETE");
  if (feeRate.lt(0) || feeRate.gt(100)) throw new Error("EPAY_FEE_INVALID");
  if (minAmount.lt("0.01") || maxAmount.gt("100000000") || maxAmount.lt(minAmount)) throw new Error("EPAY_AMOUNT_RANGE_INVALID");
  await assertSafeUpstream(gatewayUrl, "PUBLIC_API");
  return { name, gatewayUrl, merchantPid, merchantKey, paymentTypes, feeRate, minAmount, maxAmount, sortOrder: input.sortOrder, enabled: input.enabled, description };
}

export async function createPaymentProvider(input: PaymentProviderInput) {
  const value = await normalizePaymentProviderInput(input);
  if (!value.merchantKey) throw new Error("EPAY_KEY_REQUIRED");
  const { merchantKey, ...data } = value;
  return prisma.paymentProvider.create({
    data: {
      ...data,
      merchantKeyEncrypted: encryptJson({ merchantKey }),
    },
    include: { _count: { select: { orders: true } } },
  });
}

export async function updatePaymentProvider(id: string, input: PaymentProviderInput) {
  const value = await normalizePaymentProviderInput(input);
  const { merchantKey, ...data } = value;
  return prisma.$transaction(async (transaction) => {
    if (!(await lockPaymentProvider(transaction, id))) throw new Error("EPAY_PROVIDER_NOT_FOUND");
    const existing = await transaction.paymentProvider.findUnique({ where: { id } });
    if (!existing) throw new Error("EPAY_PROVIDER_NOT_FOUND");
    const now = new Date();
    await transaction.paymentOrder.updateMany({
      where: { paymentProviderId: id, status: "PENDING", expiresAt: { lte: now } },
      data: { status: "EXPIRED" },
    });
    const pendingOrderCount = await transaction.paymentOrder.count({ where: { paymentProviderId: id, status: "PENDING" } });
    if (pendingOrderCount > 0 && (value.merchantPid !== existing.merchantPid || Boolean(merchantKey))) throw new Error("EPAY_PROVIDER_PENDING_CONFIG_LOCKED");
    return transaction.paymentProvider.update({
      where: { id },
      data: {
        ...data,
        ...(merchantKey ? { merchantKeyEncrypted: encryptJson({ merchantKey }) } : {}),
        healthStatus: "UNKNOWN",
        lastTestedAt: null,
        lastTestMessage: null,
      },
      include: { _count: { select: { orders: true } } },
    });
  });
}

export async function enabledPaymentProviderViews() {
  const providers = await prisma.paymentProvider.findMany({ where: { enabled: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  return providers.map((provider) => ({
    id: provider.id,
    name: provider.name,
    paymentTypes: provider.paymentTypes.filter((value): value is EpayPaymentType => epayPaymentTypes.includes(value as EpayPaymentType)),
    feeRate: provider.feeRate.toString(),
    minAmount: provider.minAmount.toString(),
    maxAmount: provider.maxAmount.toString(),
  }));
}

async function fetchProviderGateway(gatewayUrl: string) {
  let target = new URL(gatewayUrl);
  for (let redirects = 0; redirects <= 2; redirects += 1) {
    await assertSafeUpstream(target.toString(), "PUBLIC_API");
    const response = await fetch(target, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(8000), cache: "no-store", headers: { "User-Agent": "Star-API payment provider health check" } });
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      if (response.body) await response.body.cancel().catch(() => undefined);
      if (response.status >= 500) throw new Error(`EPAY_GATEWAY_HTTP_${response.status}`);
      return response.status;
    }
    const location = response.headers.get("location");
    if (response.body) await response.body.cancel().catch(() => undefined);
    if (!location || redirects === 2) throw new Error("EPAY_GATEWAY_REDIRECT_INVALID");
    const next = new URL(location, target);
    if (target.protocol === "https:" && next.protocol !== "https:") throw new Error("EPAY_GATEWAY_DOWNGRADE_BLOCKED");
    target = next;
  }
  throw new Error("EPAY_GATEWAY_UNAVAILABLE");
}

export async function testPaymentProvider(id: string) {
  const provider = await prisma.paymentProvider.findUnique({ where: { id } });
  if (!provider) throw new Error("EPAY_PROVIDER_NOT_FOUND");
  const testedAt = new Date();
  try {
    const status = await fetchProviderGateway(provider.gatewayUrl);
    return prisma.paymentProvider.update({ where: { id }, data: { healthStatus: "HEALTHY", lastTestedAt: testedAt, lastTestMessage: `网关可达（HTTP ${status}）` }, include: { _count: { select: { orders: true } } } });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 180) : "EPAY_GATEWAY_UNAVAILABLE";
    await prisma.paymentProvider.update({ where: { id }, data: { healthStatus: "UNHEALTHY", lastTestedAt: testedAt, lastTestMessage: message } });
    throw error;
  }
}
