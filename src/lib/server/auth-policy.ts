import "server-only";

import type { Prisma } from "@prisma/client";
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

export async function canAdministratorsUseGithubLogin() {
  const github = await prisma.integrationSetting.findUnique({ where: { key: "github" } });
  if (!github?.enabled || !github.secretEncrypted) return false;
  const config = github.publicConfig && typeof github.publicConfig === "object" && !Array.isArray(github.publicConfig)
    ? github.publicConfig as Record<string, unknown>
    : {};
  if (typeof config.clientId !== "string" || !config.clientId.trim()) return false;

  const linkedAdmin = await prisma.oAuthAccount.findFirst({
    where: { provider: "github", user: { platformRole: "ADMIN", status: "ACTIVE" } },
    select: { id: true },
  });
  return Boolean(linkedAdmin);
}
