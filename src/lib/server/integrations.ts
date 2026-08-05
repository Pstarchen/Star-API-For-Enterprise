import "server-only";

import type { Prisma } from "@prisma/client";
import { decryptJson, encryptJson } from "@/lib/server/encryption";
import { prisma } from "@/lib/server/prisma";

export const integrationKeys = ["github", "smtp", "alipay", "wechat", "bank-transfer"] as const;
export type IntegrationKey = (typeof integrationKeys)[number];

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function getIntegration(key: IntegrationKey, includeSecrets = false) {
  const setting = await prisma.integrationSetting.findUnique({ where: { key } });
  if (!setting) return { key, enabled: false, configured: false, publicConfig: {}, secrets: {} };
  return {
    key,
    enabled: setting.enabled,
    configured: Boolean(setting.secretEncrypted) || key === "bank-transfer",
    publicConfig: objectValue(setting.publicConfig),
    secrets: includeSecrets ? decryptJson(setting.secretEncrypted) : {},
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
  const secretEncrypted = input.keepSecrets
    ? existing?.secretEncrypted
    : input.secrets && Object.values(input.secrets).some((value) => value !== "" && value != null)
      ? encryptJson(input.secrets)
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
    return { key, enabled: item.enabled, configured: item.configured, publicConfig: item.publicConfig };
  }));
}
