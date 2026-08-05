export type ApiCategory =
  | "全部"
  | "身份核验"
  | "企业数据"
  | "智能识别"
  | "位置服务"
  | "消息通信"
  | "生活服务";

export type ApiProduct = {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  category: Exclude<ApiCategory, "全部">;
  description: string;
  method: "GET" | "POST";
  endpoint: string;
  latency: number;
  uptime: number;
  calls: string;
  price: string;
  tags: string[];
  featured?: boolean;
  verified?: boolean;
  provider: string;
  color: string;
};

export type ActivityLog = {
  id: string;
  time: string;
  api: string;
  app: string;
  status: number;
  latency: number;
  region: string;
};

export type AppItem = {
  id: string;
  name: string;
  env: "生产" | "测试";
  keyPrefix: string;
  calls: string;
  quota: number;
  status: "运行中" | "已暂停";
  lastUsed: string;
};
