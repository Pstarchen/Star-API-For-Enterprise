export type ApplicationView = {
  id: string;
  name: string;
  environment: "TEST" | "PRODUCTION";
  status: string;
  createdAt: string;
  calls: number;
  cost: string;
  keys: { id: string; name: string; prefix: string; status: "ACTIVE" | "REVOKED" | "EXPIRED"; lastUsedAt: string | null; createdAt: string }[];
  subscriptions: { id: string; productId: string; productName: string; status: "ACTIVE" | "PAUSED" | "CANCELED"; quotaMonthly: string; qpsLimit: number; unitPrice: string }[];
};
