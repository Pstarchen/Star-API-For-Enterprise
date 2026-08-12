import { connection } from "next/server";
import { AdminSubscriptionManager } from "@/components/admin-subscription-manager";
import { listAdminSubscriptions } from "@/lib/server/admin-subscriptions";

export default async function AdminSubscriptionsPage() {
  await connection();
  return <AdminSubscriptionManager initialSubscriptions={await listAdminSubscriptions()} />;
}
