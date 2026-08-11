export type PlatformConfig = {
  name: string;
  description: string;
  publicUrl: string;
  icpNumber: string;
  publicSecurityNumber: string;
  hasCustomIcon: boolean;
  hasCustomHero: boolean;
  revision: string;
};

export const defaultPlatformConfig: PlatformConfig = {
  name: "Star-API",
  description: "面向个人开发者与企业团队的公共 API 聚合、开放与分发平台。",
  publicUrl: "",
  icpNumber: "",
  publicSecurityNumber: "",
  hasCustomIcon: false,
  hasCustomHero: false,
  revision: "default",
};

export function platformIconUrl(config: PlatformConfig) {
  return `/api/v1/branding/icon?v=${encodeURIComponent(config.revision)}`;
}

export function platformHeroUrl(config: PlatformConfig) {
  return config.hasCustomHero ? `/api/v1/branding/hero?v=${encodeURIComponent(config.revision)}` : "/art/anime-operator.jpg";
}
