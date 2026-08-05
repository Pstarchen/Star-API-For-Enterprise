export type AdminUserView = {
  id: string;
  name: string;
  email: string;
  accountType: "PERSONAL" | "ENTERPRISE";
  platformRole: "USER" | "ADMIN";
  status: "ACTIVE" | "SUSPENDED";
  workspaces: string[];
  calls: number;
  lastLoginAt: string | null;
  createdAt: string;
};
