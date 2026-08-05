import { z } from "zod";
import { getCurrentUser } from "@/lib/server/auth";
import { prisma } from "@/lib/server/prisma";
import { noStoreHeaders, requestIp } from "@/lib/server/request";

const schema = z.object({ id: z.string().min(1), status: z.enum(["PENDING", "ACTIVE", "SUSPENDED", "CLOSED"]) }).strict();

export async function PATCH(request: Request) {
  const admin = await getCurrentUser();
  if (!admin) return Response.json({ code: 401, message: "请先登录" }, { status: 401, headers: noStoreHeaders });
  if (admin.platformRole !== "ADMIN") return Response.json({ code: 403, message: "仅平台管理员可以管理空间状态" }, { status: 403, headers: noStoreHeaders });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: 400, message: "空间状态参数不正确" }, { status: 400, headers: noStoreHeaders });
  const tenant = await prisma.tenant.findUnique({ where: { id: parsed.data.id } });
  if (!tenant) return Response.json({ code: 404, message: "空间不存在" }, { status: 404, headers: noStoreHeaders });
  if (tenant.status === "CLOSED" && parsed.data.status !== "CLOSED") return Response.json({ code: 409, message: "已关闭空间不可恢复，请新建空间" }, { status: 409, headers: noStoreHeaders });
  await prisma.$transaction([
    prisma.tenant.update({ where: { id: tenant.id }, data: { status: parsed.data.status } }),
    prisma.auditLog.create({ data: { tenantId: tenant.id, actorId: admin.id, action: "tenant.status.update", resource: "tenant", resourceId: tenant.id, metadata: { previous: tenant.status, next: parsed.data.status }, ipAddress: requestIp(request) } }),
  ]);
  return Response.json({ code: 200, message: "空间状态已更新", data: { id: tenant.id, status: parsed.data.status } }, { headers: noStoreHeaders });
}
