import { connection } from "next/server";
import { PlatformSettingsForm } from "@/components/platform-settings-form";
import { getPlatformConfig } from "@/lib/server/installation";
import { IntegrationSettingsForm } from "@/components/integration-settings-form";
import { integrationSummaries } from "@/lib/server/integrations";
import { AuthPolicyForm } from "@/components/auth-policy-form";
import { getAuthPolicy } from "@/lib/server/auth-policy";

export default async function AdminSettingsPage() {
  await connection();
  const [config, authPolicy, integrations] = await Promise.all([getPlatformConfig(), getAuthPolicy(), integrationSummaries()]);
  return <div className="space-y-10 pb-10"><PlatformSettingsForm config={config} /><AuthPolicyForm initial={authPolicy} /><IntegrationSettingsForm initial={integrations} /></div>;
}
