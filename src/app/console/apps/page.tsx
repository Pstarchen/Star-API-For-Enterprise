import { AppsManager } from "@/components/apps-manager";
import { getCurrentUser, getCurrentWorkspace } from "@/lib/server/auth";
import { listApplications } from "@/lib/server/applications";
import { listCatalogProducts } from "@/lib/server/catalog";
import { connection } from "next/server";

export default async function AppsPage() {
  await connection();
  const user = await getCurrentUser();
  const workspace = user ? await getCurrentWorkspace(user) : null;
  const [apps, products] = await Promise.all([workspace ? listApplications(workspace.tenantId) : [], listCatalogProducts({ status: "PUBLISHED" })]);
  return <AppsManager initialApps={apps} products={products} />;
}
