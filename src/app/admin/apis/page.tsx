import { AdminApiManager } from "@/components/admin-api-manager";
import { publicHostFromUrl } from "@/lib/api-routes";
import { listCatalogProducts } from "@/lib/server/catalog";
import { getPlatformConfig } from "@/lib/server/installation";
import { connection } from "next/server";

export default async function AdminApisPage() {
  await connection();
  const [apis, platform] = await Promise.all([listCatalogProducts(), getPlatformConfig()]);
  return <AdminApiManager initialApis={apis} defaultPublicHost={publicHostFromUrl(platform.publicUrl)} defaultPublicUrl={platform.publicUrl} />;
}
