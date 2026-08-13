import "server-only";

import { Prisma } from "@prisma/client";
import { decryptJson, encryptJson } from "@/lib/server/encryption";
import { normalizeEpayEndpointUrl, normalizeEpayGatewayUrl } from "@/lib/epay";
import { epayPaymentTypes, epayProtocolProfileForGateway, epayProtocolProfiles, epaySubmissionModes, isEpayPaymentTypeSupported, type EpayPaymentType, type EpayProtocolProfile, type EpaySubmissionMode } from "@/lib/payment-options";
import { prisma } from "@/lib/server/prisma";
import { assertSafeUpstream } from "@/lib/server/upstream";

export type PaymentProviderInput = {
  name: string;
  gatewayUrl: string;
  merchantPid: string;
  merchantKey?: string;
  paymentTypes: EpayPaymentType[];
  submissionMode?: EpaySubmissionMode;
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
  protocolProfile: string;
  submissionMode: string;
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
  const submissionMode: EpaySubmissionMode = epaySubmissionModes.includes(provider.submissionMode as EpaySubmissionMode)
    ? provider.submissionMode as EpaySubmissionMode
    : "REDIRECT";
  const protocolProfile: EpayProtocolProfile = epayProtocolProfiles.includes(provider.protocolProfile as EpayProtocolProfile)
    ? provider.protocolProfile as EpayProtocolProfile
    : "GENERIC_EPAY";
  return {
    id: provider.id,
    name: provider.name,
    gatewayUrl: provider.gatewayUrl,
    merchantPid: provider.merchantPid,
    merchantKeyConfigured: provider.merchantKeyEncrypted.length > 0,
    paymentTypes: provider.paymentTypes,
    protocolProfile,
    submissionMode,
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
  const protocolProfile = epayProtocolProfileForGateway(gatewayUrl);
  const submissionMode = input.submissionMode ?? "REDIRECT";
  const feeRate = new Prisma.Decimal(input.feeRate);
  const minAmount = new Prisma.Decimal(input.minAmount);
  const maxAmount = new Prisma.Decimal(input.maxAmount);

  if (!name || !merchantPid || !paymentTypes.length) throw new Error("EPAY_PROVIDER_INCOMPLETE");
  if (paymentTypes.some((type) => !isEpayPaymentTypeSupported(protocolProfile, type))) throw new Error("EPAY_ID0_PAYMENT_TYPE_UNSUPPORTED");
  if (feeRate.lt(0) || feeRate.gt(100)) throw new Error("EPAY_FEE_INVALID");
  if (minAmount.lt("0.01") || maxAmount.gt("100000000") || maxAmount.lt(minAmount)) throw new Error("EPAY_AMOUNT_RANGE_INVALID");
  await assertSafeUpstream(gatewayUrl, "PUBLIC_API");
  return { name, gatewayUrl, merchantPid, merchantKey, paymentTypes, protocolProfile, submissionMode, feeRate, minAmount, maxAmount, sortOrder: input.sortOrder, enabled: input.enabled, description };
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
    paymentTypes: provider.paymentTypes.filter((value): value is EpayPaymentType => epayPaymentTypes.includes(value as EpayPaymentType) && isEpayPaymentTypeSupported(provider.protocolProfile as EpayProtocolProfile, value as EpayPaymentType)),
    feeRate: provider.feeRate.toString(),
    minAmount: provider.minAmount.toString(),
    maxAmount: provider.maxAmount.toString(),
  }));
}

async function fetchProviderMerchant(input: { gatewayUrl: string; merchantPid: string; merchantKey: string }) {
  let target = new URL(normalizeEpayEndpointUrl(input.gatewayUrl, "api"));
  target.search = new URLSearchParams({ act: "query", pid: input.merchantPid, key: input.merchantKey }).toString();
  const expectedOrigin = target.origin;
  for (let redirects = 0; redirects <= 2; redirects += 1) {
    await assertSafeUpstream(target.toString(), "PUBLIC_API");
    const response = await fetch(target, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(10000), cache: "no-store", headers: { Accept: "application/json", "User-Agent": "Star-API payment provider verification" } });
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      if (!response.ok) { if (response.body) await response.body.cancel().catch(() => undefined); throw new Error(`EPAY_GATEWAY_HTTP_${response.status}`); }
      const text = await response.text();
      if (Buffer.byteLength(text, "utf8") > 64 * 1024) throw new Error("EPAY_MERCHANT_RESPONSE_TOO_LARGE");
      let payload: unknown;
      try { payload = JSON.parse(text); } catch { throw new Error("EPAY_MERCHANT_RESPONSE_INVALID"); }
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("EPAY_MERCHANT_RESPONSE_INVALID");
      const result = payload as Record<string, unknown>;
      if (String(result.code ?? "") !== "1") throw new Error("EPAY_MERCHANT_REJECTED");
      if (String(result.pid ?? "") !== input.merchantPid) throw new Error("EPAY_MERCHANT_PID_MISMATCH");
      if (String(result.active ?? "") !== "1") throw new Error("EPAY_MERCHANT_DISABLED");
      const balance = typeof result.money === "string" && /^\d{1,12}(?:\.\d{1,2})?$/.test(result.money) ? result.money : null;
      return { balance };
    }
    const location = response.headers.get("location");
    if (response.body) await response.body.cancel().catch(() => undefined);
    if (!location || redirects === 2) throw new Error("EPAY_GATEWAY_REDIRECT_INVALID");
    const next = new URL(location, target);
    if (next.origin !== expectedOrigin || (target.protocol === "https:" && next.protocol !== "https:")) throw new Error("EPAY_GATEWAY_REDIRECT_BLOCKED");
    target = next;
  }
  throw new Error("EPAY_GATEWAY_UNAVAILABLE");
}

export async function testPaymentProvider(id: string) {
  const provider = await prisma.paymentProvider.findUnique({ where: { id } });
  if (!provider) throw new Error("EPAY_PROVIDER_NOT_FOUND");
  const testedAt = new Date();
  try {
    const merchant = await fetchProviderMerchant({ gatewayUrl: provider.gatewayUrl, merchantPid: provider.merchantPid, merchantKey: paymentProviderSecret(provider) });
    return prisma.paymentProvider.update({ where: { id }, data: { healthStatus: "HEALTHY", lastTestedAt: testedAt, lastTestMessage: merchant.balance ? `商户验证通过，网关余额 ¥${merchant.balance}` : "商户验证通过" }, include: { _count: { select: { orders: true } } } });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 180) : "EPAY_GATEWAY_UNAVAILABLE";
    await prisma.paymentProvider.update({ where: { id }, data: { healthStatus: "UNHEALTHY", lastTestedAt: testedAt, lastTestMessage: message } });
    throw error;
  }
}
