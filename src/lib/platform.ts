export type PlatformConfig = {
  name: string;
  description: string;
  publicUrl: string;
  icpNumber: string;
  publicSecurityNumber: string;
  hasCustomIcon: boolean;
  hasCustomHero: boolean;
  phpPackageMaxMb: number;
  revision: string;
};

export const DEFAULT_PHP_PACKAGE_MAX_MB = 16;
export const MIN_PHP_PACKAGE_MAX_MB = 1;
export const MAX_PHP_PACKAGE_MAX_MB = 1024;

export function normalizePhpPackageMaxMb(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= MIN_PHP_PACKAGE_MAX_MB && value <= MAX_PHP_PACKAGE_MAX_MB
    ? value
    : DEFAULT_PHP_PACKAGE_MAX_MB;
}

export function phpPackageMaxBytes(value: unknown) {
  return normalizePhpPackageMaxMb(value) * 1024 * 1024;
}

export function phpPackageExpandedMaxBytes(value: unknown) {
  return Math.max(32, normalizePhpPackageMaxMb(value)) * 1024 * 1024;
}

export const defaultPlatformConfig: PlatformConfig = {
  name: "Star-API",
  description: "面向个人开发者与企业团队的公共 API 聚合、开放与分发平台。",
  publicUrl: "",
  icpNumber: "",
  publicSecurityNumber: "",
  hasCustomIcon: false,
  hasCustomHero: false,
  phpPackageMaxMb: DEFAULT_PHP_PACKAGE_MAX_MB,
  revision: "default",
};

export function platformIconUrl(config: PlatformConfig) {
  return `/api/v1/branding/icon?v=${encodeURIComponent(config.revision)}`;
}

export function platformHeroUrl(config: PlatformConfig) {
  return config.hasCustomHero ? `/api/v1/branding/hero?v=${encodeURIComponent(config.revision)}` : "/art/anime-operator.jpg";
}
