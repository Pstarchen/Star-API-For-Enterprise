import { connection } from "next/server";
import { AuthPolicyForm } from "@/components/auth-policy-form";
import { getAuthPolicy } from "@/lib/server/auth-policy";

export default async function AdminAuthSettingsPage() {
  await connection();
  return <div className="pb-10"><AuthPolicyForm initial={await getAuthPolicy()} /></div>;
}
