import type { Metadata } from "next";
import { ApiMarketplace } from "@/components/api-marketplace";
import { PortalShell } from "@/components/portal-shell";
import { listCatalogProducts } from "@/lib/server/catalog";
import { connection } from "next/server";

export const metadata: Metadata = { title: "API 市场" };

export default async function MarketplacePage() {
  await connection();
  return <PortalShell><ApiMarketplace mode="full" products={await listCatalogProducts({ status: "PUBLISHED" })} /></PortalShell>;
}
