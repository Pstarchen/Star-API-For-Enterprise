import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AdminApiManager } from "@/components/admin-api-manager";
import { publicHostFromUrl } from "@/lib/api-routes";
import { getCurrentWorkspace, requireUser } from "@/lib/server/auth";
import { listCatalogProducts } from "@/lib/server/catalog";
import { getPlatformConfig } from "@/lib/server/installation";
import { prisma } from "@/lib/server/prisma";

export default async function ProviderApisPage() {
  await connection();
  const user = await requireUser("/login?next=/console/provider/apis");
  const workspace = await getCurrentWorkspace(user);
  if (!workspace || workspace.tenant.type !== "ENTERPRISE" || !["OWNER", "ADMIN"].includes(workspace.role)) redirect("/console?error=provider-role-required");
  const provider = await prisma.provider.findFirst({ where: { ownerTenantId: workspace.tenantId }, select: { id: true } });
  const [apis, platform] = await Promise.all([provider ? listCatalogProducts({ providerId: provider.id }) : [], getPlatformConfig()]);
  return <AdminApiManager initialApis={apis} defaultPublicHost={publicHostFromUrl(platform.publicUrl)} defaultPublicUrl={platform.publicUrl} canPublish={false} />;
}
