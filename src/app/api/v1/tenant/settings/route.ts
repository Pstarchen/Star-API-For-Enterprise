import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser, getCurrentWorkspace } from "@/lib/server/auth";
import { prisma } from "@/lib/server/prisma";
import { noStoreHeaders, requestIp } from "@/lib/server/request";

const schema = z.object({ name: z.string().trim().min(2).max(100), creditCode: z.string().trim().max(32).optional(), notificationEmail: z.union([z.email(), z.literal("")]), timezone: z.enum(["Asia/Shanghai", "UTC"]), quotaAlerts: z.boolean() }).strict();

export async function PATCH(request: Request) {
  const user = await getCurrentUser(); if (!user) return Response.json({ code: 401, message: "请先登录" }, { status: 401, headers: noStoreHeaders });
  const workspace = await getCurrentWorkspace(user); if (!workspace) return Response.json({ code: 409, message: "当前账号没有工作区" }, { status: 409, headers: noStoreHeaders });
  if (!["OWNER", "ADMIN"].includes(workspace.role)) return Response.json({ code: 403, message: "仅 Owner 或管理员可以修改工作区设置" }, { status: 403, headers: noStoreHeaders });
  const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return Response.json({ code: 400, message: "工作区配置不完整", details: z.flattenError(parsed.error) }, { status: 400, headers: noStoreHeaders });
  try {
    const tenant = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.tenant.update({ where: { id: workspace.tenantId }, data: { name: parsed.data.name, notificationEmail: parsed.data.notificationEmail || null, timezone: parsed.data.timezone, quotaAlerts: parsed.data.quotaAlerts, ...(workspace.tenant.type === "ENTERPRISE" ? { creditCode: parsed.data.creditCode || null } : {}) } });
      await transaction.auditLog.create({ data: { tenantId: workspace.tenantId, actorId: user.id, action: "tenant.settings.update", resource: "tenant", resourceId: workspace.tenantId, metadata: { name: parsed.data.name, timezone: parsed.data.timezone, quotaAlerts: parsed.data.quotaAlerts }, ipAddress: requestIp(request) } });
      return updated;
    });
    return Response.json({ code: 200, message: "工作区设置已保存", data: { name: tenant.name, creditCode: tenant.creditCode, notificationEmail: tenant.notificationEmail, timezone: tenant.timezone, quotaAlerts: tenant.quotaAlerts } }, { headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ code: 409, message: "统一社会信用代码已被其他企业使用" }, { status: 409, headers: noStoreHeaders });
    return Response.json({ code: 500, message: "工作区设置保存失败" }, { status: 500, headers: noStoreHeaders });
  }
}
