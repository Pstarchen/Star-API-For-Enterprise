export const apiCategories = ["身份核验", "企业数据", "智能识别", "位置服务", "消息通信", "生活服务", "开发工具", "其他"] as const;

export type CatalogProduct = {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  category: string;
  description: string;
  method: string;
  endpoint: string;
  publicHost: string;
  latency: number | null;
  uptime: number | null;
  calls: number;
  todayCalls: number;
  lastCalledAt: string | null;
  price: string;
  tags: string[];
  featured: boolean;
  verified: boolean;
  provider: string;
  color: string;
  version: string | null;
  sla: number;
  qpsLimit: number;
  billingMode: "FREE" | "PER_REQUEST";
  unitPrice: string;
  freeQuotaMonthly: string;
  status: "DRAFT" | "REVIEW" | "GRAY" | "PUBLISHED" | "DEPRECATED" | "OFFLINE";
  visibility: "PUBLIC" | "PRIVATE" | "GRAY" | "INTERNAL";
  upstreamType: "PUBLIC_API" | "SERVER_LOCAL" | "TUNNEL" | "CONTENT" | "PHP_PACKAGE" | "BUILTIN";
  internalHandler: string | null;
  assetCount: number;
  updatedAt: string;
  schema: unknown;
};

export function formatPrice(billingMode: CatalogProduct["billingMode"], unitPrice: string, freeQuotaMonthly: string) {
  if (billingMode === "FREE") return "免费";
  const quota = BigInt(freeQuotaMonthly);
  const price = Number(unitPrice).toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 6 });
  return quota > BigInt(0) ? `前 ${quota.toLocaleString("zh-CN")} 次免费，后 ¥${price}/次` : `¥${price}/次`;
}
