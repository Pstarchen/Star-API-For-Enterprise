import "server-only";

import type { Prisma } from "@prisma/client";
import { decryptJson, encryptJson } from "@/lib/server/encryption";
import { prisma } from "@/lib/server/prisma";

export const integrationKeys = ["github", "smtp", "alipay", "wechat", "bank-transfer", "code-pay"] as const;
export type IntegrationKey = (typeof integrationKeys)[number];

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function getIntegration(key: IntegrationKey, includeSecrets = false) {
  const setting = await prisma.integrationSetting.findUnique({ where: { key } });
  if (!setting) return { key, enabled: false, configured: false, secretConfigured: false, publicConfig: {}, secrets: {} };
  const publicConfig = objectValue(setting.publicConfig);
  const githubClientId = typeof publicConfig.clientId === "string" ? publicConfig.clientId.trim() : "";
  let storedSecrets: Record<string, unknown> = {};
  if (setting.secretEncrypted) {
    try { storedSecrets = decryptJson(setting.secretEncrypted); } catch { storedSecrets = {}; }
  }
  const secretConfigured = Object.keys(storedSecrets).length > 0;
  const configured = key === "bank-transfer"
    ? Boolean(publicConfig.accountName && publicConfig.bankName && publicConfig.accountNumber)
    : key === "code-pay"
      ? Boolean(publicConfig.qrImageUrl || publicConfig.paymentUrl)
      : key === "smtp"
        ? Boolean(publicConfig.host && Number(publicConfig.port) > 0 && publicConfig.fromEmail && publicConfig.username && storedSecrets.password)
      : key === "github"
        ? Boolean(githubClientId && storedSecrets.clientSecret)
        : key === "alipay"
          ? Boolean(publicConfig.appId && publicConfig.gatewayUrl && publicConfig.notifyUrl && storedSecrets.privateKey && storedSecrets.alipayPublicKey)
          : key === "wechat"
            ? Boolean(publicConfig.merchantId && publicConfig.appId && publicConfig.serialNo && publicConfig.platformSerialNo && publicConfig.notifyUrl && storedSecrets.privateKey && storedSecrets.apiV3Key && storedSecrets.platformPublicKey)
            : secretConfigured;
  return {
    key,
    enabled: setting.enabled,
    configured,
    secretConfigured,
    publicConfig,
    secrets: includeSecrets ? storedSecrets : {},
  };
}

export async function getPublicIntegrations() {
  return Promise.all(integrationKeys.map((key) => getIntegration(key)));
}

export async function saveIntegration(input: {
  key: IntegrationKey;
  enabled: boolean;
  publicConfig: Record<string, unknown>;
  secrets?: Record<string, unknown>;
  keepSecrets?: boolean;
}) {
  const existing = await prisma.integrationSetting.findUnique({ where: { key: input.key } });
  let previousSecrets: Record<string, unknown> = {};
  if (existing?.secretEncrypted) {
    try { previousSecrets = decryptJson(existing.secretEncrypted); } catch { previousSecrets = {}; }
  }
  const secretEncrypted = input.keepSecrets
    ? existing?.secretEncrypted
    : input.secrets && Object.values(input.secrets).some((value) => value !== "" && value != null)
      ? encryptJson({ ...previousSecrets, ...input.secrets })
      : null;
  return prisma.integrationSetting.upsert({
    where: { key: input.key },
    create: { key: input.key, enabled: input.enabled, publicConfig: input.publicConfig as Prisma.InputJsonValue, secretEncrypted },
    update: { enabled: input.enabled, publicConfig: input.publicConfig as Prisma.InputJsonValue, secretEncrypted },
  });
}

export async function integrationSummaries() {
  return Promise.all(integrationKeys.map(async (key) => {
    const item = await getIntegration(key);
    return { key, enabled: item.enabled, configured: item.configured, secretConfigured: item.secretConfigured, publicConfig: item.publicConfig };
  }));
}
