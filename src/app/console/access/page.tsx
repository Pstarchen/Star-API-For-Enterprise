import { connection } from "next/server";
import { MembersManager, type MemberView } from "@/components/members-manager";
import { getCurrentUser, getCurrentWorkspace } from "@/lib/server/auth";
import { prisma } from "@/lib/server/prisma";

export default async function AccessPage() {
  await connection();
  const user = await getCurrentUser(); const workspace = user ? await getCurrentWorkspace(user) : null;
  const records = workspace ? await prisma.membership.findMany({ where: { tenantId: workspace.tenantId }, include: { user: true }, orderBy: { createdAt: "asc" } }) : [];
  const members: MemberView[] = records.map((member) => ({ id: member.id, role: member.role, createdAt: member.createdAt.toISOString(), user: { id: member.user.id, name: member.user.name, email: member.user.email, status: member.user.status, lastLoginAt: member.user.lastLoginAt?.toISOString() ?? null } }));
  return <MembersManager initial={members} canManage={Boolean(workspace && ["OWNER", "ADMIN"].includes(workspace.role))} />;
}
