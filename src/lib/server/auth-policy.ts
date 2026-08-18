import "server-only";

import type { Prisma } from "@prisma/client";
import { getIntegration } from "@/lib/server/integrations";
import { prisma } from "@/lib/server/prisma";

export const AUTH_POLICY_SETTING_KEY = "auth-policy";

export type AuthPolicy = {
  passwordLoginEnabled: boolean;
  registrationEnabled: boolean;
  registrationEmailVerificationRequired: boolean;
};

export const defaultAuthPolicy: AuthPolicy = {
  passwordLoginEnabled: true,
  registrationEnabled: true,
  registrationEmailVerificationRequired: false,
};

export async function getAuthPolicy(): Promise<AuthPolicy> {
  const setting = await prisma.platformSetting.findUnique({ where: { key: AUTH_POLICY_SETTING_KEY } });
  if (!setting || typeof setting.value !== "object" || Array.isArray(setting.value)) return defaultAuthPolicy;
  const value = setting.value as Record<string, unknown>;
  return {
    passwordLoginEnabled: value.passwordLoginEnabled !== false,
    registrationEnabled: value.registrationEnabled !== false,
    registrationEmailVerificationRequired: value.registrationEmailVerificationRequired === true,
  };
}

export async function saveAuthPolicy(policy: AuthPolicy) {
  return prisma.platformSetting.upsert({
    where: { key: AUTH_POLICY_SETTING_KEY },
    create: { key: AUTH_POLICY_SETTING_KEY, value: policy as unknown as Prisma.InputJsonValue },
    update: { value: policy as unknown as Prisma.InputJsonValue },
  });
}

export async function canAdministratorsUseOAuthLogin(excludeProvider?: "github" | "qq") {
  const providers = (["github", "qq"] as const).filter((provider) => provider !== excludeProvider);
  const available = await Promise.all(providers.map(async (provider) => {
    const integration = await getIntegration(provider);
    if (!integration.enabled || !integration.configured) return false;
    const linkedAdmin = await prisma.oAuthAccount.findFirst({
      where: { provider, user: { platformRole: "ADMIN", status: "ACTIVE" } },
      select: { id: true },
    });
    return Boolean(linkedAdmin);
  }));
  return available.some(Boolean);
}
