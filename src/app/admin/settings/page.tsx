import { connection } from "next/server";
import { PlatformSettingsForm } from "@/components/platform-settings-form";
import { getPlatformConfig } from "@/lib/server/installation";

export default async function AdminSettingsPage() {
  await connection();
  const config = await getPlatformConfig();
  return <div className="pb-10"><PlatformSettingsForm config={config} /></div>;
}
