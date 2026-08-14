import { AdminApiManager } from "@/components/admin-api-manager";
import { publicHostFromUrl } from "@/lib/api-routes";
import { listApiCategories } from "@/lib/server/api-categories";
import { listCatalogProducts } from "@/lib/server/catalog";
import { getPlatformConfig } from "@/lib/server/installation";
import { connection } from "next/server";

export default async function AdminApisPage() {
  await connection();
  const [apis, platform, categories] = await Promise.all([listCatalogProducts(), getPlatformConfig(), listApiCategories(true)]);
  return <AdminApiManager initialApis={apis} initialCategories={categories} defaultPublicHost={publicHostFromUrl(platform.publicUrl)} defaultPublicUrl={platform.publicUrl} phpPackageMaxMb={platform.phpPackageMaxMb} />;
}
