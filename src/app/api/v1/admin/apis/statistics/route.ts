import { getCurrentUser } from "@/lib/server/auth";
import { getApiOperationsStatistics } from "@/lib/server/api-statistics";
import { noStoreHeaders } from "@/lib/server/request";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ code: 401, message: "请先登录" }, { status: 401, headers: noStoreHeaders });
  if (user.platformRole !== "ADMIN") return Response.json({ code: 403, message: "仅平台管理员可以查看全平台调用统计" }, { status: 403, headers: noStoreHeaders });
  return Response.json({ code: 200, data: await getApiOperationsStatistics() }, { headers: noStoreHeaders });
}
