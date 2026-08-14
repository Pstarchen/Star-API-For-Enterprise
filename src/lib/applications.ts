export type ApplicationView = {
  id: string;
  name: string;
  environment: "TEST" | "PRODUCTION";
  status: string;
  createdAt: string;
  calls: number;
  cost: string;
  keys: { id: string; name: string; prefix: string; status: "ACTIVE" | "REVOKED" | "EXPIRED"; lastUsedAt: string | null; createdAt: string }[];
  subscriptions: {
    id: string;
    productId: string;
    productName: string;
    status: "ACTIVE" | "PAUSED" | "CANCELED";
    quotaMonthly: string;
    qpsLimit: number;
    unitPrice: string;
    endpoints: Array<{
      id: string;
      methods: string[];
      publicPath: string;
      routeVersion: string;
      summary: string;
      parameters: Array<{ id: string; location: "PATH" | "QUERY" | "BODY"; name: string; required: boolean; dataType: string; description: string; defaultValue: string | null }>;
    }>;
  }[];
  directLinks: Array<{
    id: string;
    subscriptionId: string;
    endpointId: string;
    name: string;
    productName: string;
    publicPath: string;
    routeVersion: string;
    path: string | null;
    prefix: string;
    defaultParameters: Record<string, string>;
    status: "ACTIVE" | "REVOKED" | "EXPIRED";
    expiresAt: string | null;
    lastUsedAt: string | null;
    createdAt: string;
  }>;
};
