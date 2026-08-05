import { Prisma } from "@prisma/client";
import { z } from "zod";
import { issueApiKey } from "@/lib/server/api-key";
import { getCurrentUser, getCurrentWorkspace } from "@/lib/server/auth";
import { getApplication } from "@/lib/server/applications";
import { prisma } from "@/lib/server/prisma";
import { noStoreHeaders, requestIp } from "@/lib/server/request";

const createSchema = z.object({ name: z.string().trim().min(2).max(80), environment: z.enum(["TEST", "PRODUCTION"]) }).strict();
const updateSchema = z.object({ id: z.string().min(1), status: z.enum(["active", "paused"]) }).strict();

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ code: 401, message: "请先登录" }, { status: 401, headers: noStoreHeaders });
  const workspace = await getCurrentWorkspace(user);
  if (!workspace) return Response.json({ code: 409, message: "当前账号没有工作区" }, { status: 409, headers: noStoreHeaders });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: 400, message: "应用配置不完整" }, { status: 400, headers: noStoreHeaders });
  const key = issueApiKey(parsed.data.environment === "PRODUCTION" ? "live" : "test");
  const app = await prisma.$transaction(async (transaction) => {
    const created = await transaction.application.create({ data: { tenantId: workspace.tenantId, name: parsed.data.name, environment: parsed.data.environment } });
    await transaction.apiKey.create({ data: { appId: created.id, name: "默认密钥", prefix: key.prefix, secretHash: key.secretHash, scopes: [] } });
    await transaction.auditLog.create({ data: { tenantId: workspace.tenantId, actorId: user.id, action: "application.create", resource: "application", resourceId: created.id, metadata: { environment: parsed.data.environment }, ipAddress: requestIp(request) } });
    return created;
  });
  return Response.json({ code: 201, message: "应用与默认密钥已创建", data: { app: await getApplication(app.id), secret: key.secret } }, { status: 201, headers: noStoreHeaders });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ code: 401, message: "请先登录" }, { status: 401, headers: noStoreHeaders });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: 400, message: "应用状态参数不正确" }, { status: 400, headers: noStoreHeaders });
  const app = await prisma.application.findFirst({ where: { id: parsed.data.id, tenant: { memberships: { some: { userId: user.id } } } } });
  if (!app) return Response.json({ code: 404, message: "应用不存在或无权访问" }, { status: 404, headers: noStoreHeaders });
  await prisma.$transaction([
    prisma.application.update({ where: { id: app.id }, data: { status: parsed.data.status } }),
    prisma.auditLog.create({ data: { tenantId: app.tenantId, actorId: user.id, action: "application.status.update", resource: "application", resourceId: app.id, metadata: { previous: app.status, next: parsed.data.status }, ipAddress: requestIp(request) } }),
  ]);
  return Response.json({ code: 200, message: "应用状态已更新", data: await getApplication(app.id) }, { headers: noStoreHeaders });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ code: 401, message: "请先登录" }, { status: 401, headers: noStoreHeaders });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ code: 400, message: "缺少应用 ID" }, { status: 400, headers: noStoreHeaders });
  const app = await prisma.application.findFirst({ where: { id, tenant: { memberships: { some: { userId: user.id } } } }, include: { _count: { select: { requestLogs: true } } } });
  if (!app) return Response.json({ code: 404, message: "应用不存在或无权访问" }, { status: 404, headers: noStoreHeaders });
  if (app._count.requestLogs) return Response.json({ code: 409, message: "应用已有调用与账务记录，只能暂停，不能删除" }, { status: 409, headers: noStoreHeaders });
  try {
    await prisma.application.delete({ where: { id: app.id } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) return Response.json({ code: 409, message: "应用仍有关联资源，暂不能删除" }, { status: 409, headers: noStoreHeaders });
    throw error;
  }
  return Response.json({ code: 200, message: "应用已删除" }, { headers: noStoreHeaders });
}
