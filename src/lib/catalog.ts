export type ApiCategoryOption = {
  id: string;
  name: string;
  description: string;
  sortOrder: number;
  enabled: boolean;
  productCount: number;
};

export type CatalogProduct = {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  categoryId: string;
  category: string;
  description: string;
  method: string;
  methods: string[];
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
  requestParameters: Array<{ id: string; location: "PATH" | "QUERY" | "BODY"; name: string; upstreamName: string | null; required: boolean; dataType: string; description: string; defaultValue: string | null; validation: unknown; sensitive: boolean }>;
  responseParameters: Array<{ id: string; name: string; dataType: string; description: string; sortOrder: number }>;
  responseFormats: string[];
  responseExample: unknown;
};

export function formatPrice(billingMode: CatalogProduct["billingMode"], unitPrice: string, freeQuotaMonthly: string) {
  if (billingMode === "FREE") return "免费";
  const quota = BigInt(freeQuotaMonthly);
  const price = Number(unitPrice).toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 6 });
  return quota > BigInt(0) ? `前 ${quota.toLocaleString("zh-CN")} 次免费，后 ¥${price}/次` : `¥${price}/次`;
}
