import { connection } from "next/server";
import { PlatformSettingsForm } from "@/components/platform-settings-form";
import { getPlatformConfig } from "@/lib/server/installation";
import { IntegrationSettingsForm } from "@/components/integration-settings-form";
import { integrationSummaries } from "@/lib/server/integrations";

export default async function AdminSettingsPage() {
  await connection();
  const [config, integrations] = await Promise.all([getPlatformConfig(), integrationSummaries()]);
  return <div className="space-y-10 pb-10"><PlatformSettingsForm config={config} /><IntegrationSettingsForm initial={integrations} /></div>;
}
