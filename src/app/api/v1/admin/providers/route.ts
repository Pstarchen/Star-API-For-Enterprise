import { z } from "zod";
import { getCurrentUser } from "@/lib/server/auth";
import { prisma } from "@/lib/server/prisma";
import { noStoreHeaders, requestIp } from "@/lib/server/request";

const schema = z.object({ id: z.string().min(1), verified: z.boolean() }).strict();

export async function PATCH(request: Request) {
  const admin = await getCurrentUser();
  if (!admin) return Response.json({ code: 401, message: "请先登录" }, { status: 401, headers: noStoreHeaders });
  if (admin.platformRole !== "ADMIN") return Response.json({ code: 403, message: "仅平台管理员可以审核服务商" }, { status: 403, headers: noStoreHeaders });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: 400, message: "服务商审核参数不正确" }, { status: 400, headers: noStoreHeaders });
  const provider = await prisma.provider.findUnique({ where: { id: parsed.data.id } });
  if (!provider) return Response.json({ code: 404, message: "服务商不存在" }, { status: 404, headers: noStoreHeaders });
  const verifiedAt = parsed.data.verified ? new Date() : null;
  await prisma.$transaction([
    prisma.provider.update({ where: { id: provider.id }, data: { verifiedAt } }),
    prisma.auditLog.create({ data: { tenantId: admin.memberships[0]?.tenantId, actorId: admin.id, action: parsed.data.verified ? "provider.verify" : "provider.unverify", resource: "provider", resourceId: provider.id, metadata: { name: provider.name }, ipAddress: requestIp(request) } }),
  ]);
  return Response.json({ code: 200, message: parsed.data.verified ? "服务商已通过认证" : "服务商认证已撤销", data: { id: provider.id, verifiedAt: verifiedAt?.toISOString() ?? null } }, { headers: noStoreHeaders });
}
