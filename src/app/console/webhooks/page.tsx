import { connection } from "next/server";
import { WebhooksManager, type WebhookView } from "@/components/webhooks-manager";
import { getCurrentUser, getCurrentWorkspace } from "@/lib/server/auth";
import { prisma } from "@/lib/server/prisma";

export default async function WebhooksPage() {
  await connection();
  const user = await getCurrentUser(); const workspace = user ? await getCurrentWorkspace(user) : null;
  const apps = workspace ? await prisma.application.findMany({ where: { tenantId: workspace.tenantId }, include: { webhooks: true }, orderBy: { createdAt: "desc" } }) : [];
  const initial: WebhookView[] = apps.flatMap((app) => app.webhooks.map((item) => ({ id: item.id, appId: app.id, appName: app.name, name: item.name, url: item.url, events: item.events, enabled: item.enabled, createdAt: item.createdAt.toISOString() })));
  return <WebhooksManager initial={initial} apps={apps.map((app) => ({ id: app.id, name: app.name }))} />;
}
