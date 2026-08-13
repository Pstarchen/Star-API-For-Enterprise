import { connection } from "next/server";
import { PlatformSettingsForm } from "@/components/platform-settings-form";
import { SystemUpdatePanel } from "@/components/system-update-panel";
import { getPlatformConfig } from "@/lib/server/installation";
import { getSystemUpdateStatus } from "@/lib/server/system-update";

export default async function AdminSettingsPage() {
  await connection();
  const [config, updateStatus] = await Promise.all([getPlatformConfig(), getSystemUpdateStatus()]);
  return <div className="pb-10"><div className="mx-auto max-w-5xl space-y-5"><SystemUpdatePanel initialStatus={updateStatus} /></div><PlatformSettingsForm config={config} /></div>;
}
