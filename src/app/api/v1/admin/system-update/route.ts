import { z } from "zod";
import { getCurrentUser } from "@/lib/server/auth";
import { noStoreHeaders } from "@/lib/server/request";
import { getSystemUpdateStatus, triggerSystemUpdate } from "@/lib/server/system-update";

const updateSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/, "版本号必须使用 X.Y.Z 格式"),
}).strict();

async function authorizeAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: Response.json({ code: 401, message: "请先登录" }, { status: 401, headers: noStoreHeaders }) } as const;
  if (user.platformRole !== "ADMIN") return { error: Response.json({ code: 403, message: "仅平台管理员可以更新系统" }, { status: 403, headers: noStoreHeaders }) } as const;
  return { user } as const;
}

export async function GET() {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;
  return Response.json({ code: 200, data: await getSystemUpdateStatus() }, { headers: noStoreHeaders });
}

export async function POST(request: Request) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: 400, message: "更新版本不正确", details: z.flattenError(parsed.error) }, { status: 400, headers: noStoreHeaders });
  try {
    await triggerSystemUpdate(parsed.data.version);
    return Response.json({ code: 202, message: "已提交生产更新任务，请稍后刷新查看进度", data: await getSystemUpdateStatus() }, { status: 202, headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof Error && error.message === "UPDATE_DISABLED") return Response.json({ code: 409, message: "尚未启用本机更新服务，请先在服务器运行 production:enable-updates" }, { status: 409, headers: noStoreHeaders });
    if (error instanceof Error && error.message === "UPDATE_IN_PROGRESS") return Response.json({ code: 409, message: "已有更新任务正在排队或执行" }, { status: 409, headers: noStoreHeaders });
    if (error instanceof Error && error.message === "INVALID_VERSION") return Response.json({ code: 400, message: "更新版本不正确" }, { status: 400, headers: noStoreHeaders });
    return Response.json({ code: 502, message: "无法提交更新任务，请检查本机更新服务状态" }, { status: 502, headers: noStoreHeaders });
  }
}
