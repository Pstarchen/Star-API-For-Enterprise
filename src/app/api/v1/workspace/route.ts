import { z } from "zod";
import { getCurrentUser, setCurrentWorkspace } from "@/lib/server/auth";
import { noStoreHeaders } from "@/lib/server/request";

const schema = z.object({ tenantId: z.string().min(1).max(64) }).strict();

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ code: 401, message: "请先登录" }, { status: 401, headers: noStoreHeaders });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: 400, message: "工作区参数不正确" }, { status: 400, headers: noStoreHeaders });
  if (!user.memberships.some((membership) => membership.tenantId === parsed.data.tenantId)) return Response.json({ code: 403, message: "无权访问该工作区" }, { status: 403, headers: noStoreHeaders });
  await setCurrentWorkspace(parsed.data.tenantId);
  return Response.json({ code: 200, message: "工作区已切换" }, { headers: noStoreHeaders });
}
