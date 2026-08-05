import { getCurrentUser } from "@/lib/server/auth";
import { noStoreHeaders } from "@/lib/server/request";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ code: 401, message: "未登录" }, { status: 401, headers: noStoreHeaders });

  return Response.json({
    data: {
      id: user.id,
      name: user.name,
      email: user.email,
      accountType: user.accountType,
      platformRole: user.platformRole,
      workspaces: user.memberships.map((membership) => ({
        id: membership.tenant.id,
        name: membership.tenant.name,
        type: membership.tenant.type,
        status: membership.tenant.status,
        role: membership.role,
      })),
    },
  }, { headers: noStoreHeaders });
}
