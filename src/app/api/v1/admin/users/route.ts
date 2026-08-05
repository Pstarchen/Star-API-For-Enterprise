import { z } from "zod";
import { getCurrentUser } from "@/lib/server/auth";
import { prisma } from "@/lib/server/prisma";
import { noStoreHeaders, requestIp } from "@/lib/server/request";

const schema = z.object({ id: z.string().min(1), status: z.enum(["ACTIVE", "SUSPENDED"]) }).strict();

export async function PATCH(request: Request) {
  const admin = await getCurrentUser();
  if (!admin) return Response.json({ code: 401, message: "请先登录" }, { status: 401, headers: noStoreHeaders });
  if (admin.platformRole !== "ADMIN") return Response.json({ code: 403, message: "仅平台管理员可以管理用户" }, { status: 403, headers: noStoreHeaders });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: 400, message: "用户状态参数不正确" }, { status: 400, headers: noStoreHeaders });
  if (parsed.data.id === admin.id && parsed.data.status === "SUSPENDED") return Response.json({ code: 409, message: "不能冻结当前登录的管理员账号" }, { status: 409, headers: noStoreHeaders });
  const user = await prisma.user.findUnique({ where: { id: parsed.data.id } });
  if (!user) return Response.json({ code: 404, message: "用户不存在" }, { status: 404, headers: noStoreHeaders });
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { status: parsed.data.status } }),
    prisma.session.deleteMany({ where: { userId: user.id, ...(parsed.data.status === "SUSPENDED" ? {} : { id: "__none__" }) } }),
    prisma.auditLog.create({ data: { tenantId: admin.memberships[0]?.tenantId, actorId: admin.id, action: "user.status.update", resource: "user", resourceId: user.id, metadata: { previous: user.status, next: parsed.data.status }, ipAddress: requestIp(request) } }),
  ]);
  return Response.json({ code: 200, message: parsed.data.status === "ACTIVE" ? "用户已恢复" : "用户已冻结", data: { id: user.id, status: parsed.data.status } }, { headers: noStoreHeaders });
}
