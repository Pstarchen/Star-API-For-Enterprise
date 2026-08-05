import { connection } from "next/server";
import { PlatformSettingsForm } from "@/components/platform-settings-form";
import { getPlatformConfig } from "@/lib/server/installation";

export default async function AdminSettingsPage() {
  await connection();
  return <PlatformSettingsForm config={await getPlatformConfig()} />;
}
