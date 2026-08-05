import type { Metadata } from "next";
import { ApiMarketplace } from "@/components/api-marketplace";
import { PortalShell } from "@/components/portal-shell";

export const metadata: Metadata = { title: "API 市场" };

export default function MarketplacePage() {
  return <PortalShell><ApiMarketplace mode="full" /></PortalShell>;
}
