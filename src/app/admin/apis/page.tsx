import { AdminApiManager } from "@/components/admin-api-manager";
import { listCatalogProducts } from "@/lib/server/catalog";
import { connection } from "next/server";

export default async function AdminApisPage() {
  await connection();
  return <AdminApiManager initialApis={await listCatalogProducts()} />;
}
