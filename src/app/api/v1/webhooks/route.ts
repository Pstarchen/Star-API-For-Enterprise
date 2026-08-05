import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { getCurrentUser, getCurrentWorkspace } from "@/lib/server/auth";
import { encryptJson } from "@/lib/server/encryption";
import { prisma } from "@/lib/server/prisma";
import { noStoreHeaders, requestIp } from "@/lib/server/request";
import { assertSafeUpstream } from "@/lib/server/upstream";

const createSchema = z.object({ appId: z.string().min(1), name: z.string().trim().min(2).max(80), url: z.url(), events: z.array(z.string().trim().min(2).max(100)).min(1).max(30) }).strict();
const updateSchema = z.object({ id: z.string().min(1), enabled: z.boolean() }).strict();

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ code: 401, message: "请先登录" }, { status: 401, headers: noStoreHeaders });
  const workspace = await getCurrentWorkspace(user);
  if (!workspace) return Response.json({ code: 409, message: "当前账号没有工作区" }, { status: 409, headers: noStoreHeaders });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: 400, message: "Webhook 配置不完整" }, { status: 400, headers: noStoreHeaders });
  const app = await prisma.application.findFirst({ where: { id: parsed.data.appId, tenantId: workspace.tenantId } });
  if (!app) return Response.json({ code: 404, message: "应用不存在或不属于当前工作区" }, { status: 404, headers: noStoreHeaders });
  try { await assertSafeUpstream(parsed.data.url); }
  catch { return Response.json({ code: 400, message: "Webhook 地址必须是可解析的公网 HTTP(S) 地址" }, { status: 400, headers: noStoreHeaders }); }
  const secret = `whsec_${randomBytes(24).toString("base64url")}`;
  const endpoint = await prisma.$transaction(async (transaction) => {
    const created = await transaction.webhookEndpoint.create({ data: { appId: app.id, name: parsed.data.name, url: parsed.data.url, events: parsed.data.events, secretHash: createHash("sha256").update(secret).digest("hex"), secretEncrypted: encryptJson({ secret }) } });
    await transaction.auditLog.create({ data: { tenantId: app.tenantId, actorId: user.id, action: "webhook.create", resource: "webhook", resourceId: created.id, metadata: { appId: app.id, events: parsed.data.events }, ipAddress: requestIp(request) } });
    return created;
  });
  return Response.json({ code: 201, message: "Webhook 已创建", data: { endpoint: { ...endpoint, secretHash: undefined, secretEncrypted: undefined, createdAt: endpoint.createdAt.toISOString() }, secret } }, { status: 201, headers: noStoreHeaders });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ code: 401, message: "请先登录" }, { status: 401, headers: noStoreHeaders });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: 400, message: "Webhook 状态参数不正确" }, { status: 400, headers: noStoreHeaders });
  const endpoint = await prisma.webhookEndpoint.findFirst({ where: { id: parsed.data.id, app: { tenant: { memberships: { some: { userId: user.id } } } } }, include: { app: true } });
  if (!endpoint) return Response.json({ code: 404, message: "Webhook 不存在或无权访问" }, { status: 404, headers: noStoreHeaders });
  const updated = await prisma.webhookEndpoint.update({ where: { id: endpoint.id }, data: { enabled: parsed.data.enabled } });
  return Response.json({ code: 200, message: "Webhook 状态已更新", data: { ...updated, secretHash: undefined, secretEncrypted: undefined, createdAt: updated.createdAt.toISOString() } }, { headers: noStoreHeaders });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ code: 401, message: "请先登录" }, { status: 401, headers: noStoreHeaders });
  const id = new URL(request.url).searchParams.get("id");
  const endpoint = id ? await prisma.webhookEndpoint.findFirst({ where: { id, app: { tenant: { memberships: { some: { userId: user.id } } } } } }) : null;
  if (!endpoint) return Response.json({ code: 404, message: "Webhook 不存在或无权访问" }, { status: 404, headers: noStoreHeaders });
  await prisma.webhookEndpoint.delete({ where: { id: endpoint.id } });
  return Response.json({ code: 200, message: "Webhook 已删除" }, { headers: noStoreHeaders });
}
