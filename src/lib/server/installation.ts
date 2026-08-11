import "server-only";

import { prisma } from "@/lib/server/prisma";
import { defaultPlatformConfig, type PlatformConfig } from "@/lib/platform";

export const PLATFORM_SETTING_KEY = "platform";

export async function isInstalled() {
  const setting = await prisma.platformSetting.findUnique({
    where: { key: PLATFORM_SETTING_KEY },
    select: { key: true },
  });
  return Boolean(setting);
}

export async function getPlatformConfig(): Promise<PlatformConfig> {
  const setting = await prisma.platformSetting.findUnique({ where: { key: PLATFORM_SETTING_KEY } });
  if (!setting || typeof setting.value !== "object" || Array.isArray(setting.value)) return defaultPlatformConfig;

  const value = setting.value as Record<string, unknown>;
  return {
    name: typeof value.name === "string" && value.name.trim() ? value.name : defaultPlatformConfig.name,
    description: typeof value.description === "string" && value.description.trim() ? value.description : defaultPlatformConfig.description,
    publicUrl: typeof value.publicUrl === "string" ? value.publicUrl : "",
    icpNumber: typeof value.icpNumber === "string" ? value.icpNumber : "",
    publicSecurityNumber: typeof value.publicSecurityNumber === "string" ? value.publicSecurityNumber : "",
    hasCustomIcon: value.hasCustomIcon === true,
    hasCustomHero: value.hasCustomHero === true,
    revision: setting.updatedAt.getTime().toString(36),
  };
}
