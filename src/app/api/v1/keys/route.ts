import { z } from "zod";
import { issueApiKey } from "@/lib/server/api-key";
import { getCurrentUser } from "@/lib/server/auth";
import { prisma } from "@/lib/server/prisma";
import { noStoreHeaders } from "@/lib/server/request";

const keySchema = z.object({ appId: z.string().min(3).max(64), name: z.string().min(2).max(40), environment: z.enum(["test", "live"]), scopes: z.array(z.string().min(1).max(80)).max(30).default([]) });
const revokeSchema = z.object({ id: z.string().min(1) }).strict();

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ code: 401, message: "请先登录" }, { status: 401, headers: noStoreHeaders });

  const parsed = keySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: 400, message: "密钥参数不正确", details: z.treeifyError(parsed.error) }, { status: 400, headers: noStoreHeaders });
  const application = await prisma.application.findFirst({
    where: {
      id: parsed.data.appId,
      tenant: { memberships: { some: { userId: user.id } } },
    },
  });
  if (!application) return Response.json({ code: 404, message: "应用不存在或无权访问" }, { status: 404, headers: noStoreHeaders });

  const expectedEnvironment = parsed.data.environment === "live" ? "PRODUCTION" : "TEST";
  if (application.environment !== expectedEnvironment) {
    return Response.json({ code: 409, message: "密钥环境与应用环境不一致" }, { status: 409, headers: noStoreHeaders });
  }

  let key: ReturnType<typeof issueApiKey>;
  try {
    key = issueApiKey(parsed.data.environment);
  } catch {
    return Response.json({ code: 503, message: "密钥服务尚未完成安全配置" }, { status: 503, headers: noStoreHeaders });
  }

  const record = await prisma.$transaction(async (transaction) => {
    const created = await transaction.apiKey.create({
      data: { appId: application.id, name: parsed.data.name, prefix: key.prefix, secretHash: key.secretHash, scopes: parsed.data.scopes },
    });
    await transaction.auditLog.create({
      data: { tenantId: application.tenantId, actorId: user.id, action: "api-key.create", resource: "api-key", resourceId: created.id, metadata: { appId: application.id, prefix: key.prefix, scopes: parsed.data.scopes } },
    });
    return created;
  });

  return Response.json({ data: { id: record.id, appId: record.appId, name: record.name, prefix: record.prefix, secret: key.secret, scopes: record.scopes, createdAt: record.createdAt.toISOString() } }, { status: 201, headers: noStoreHeaders });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ code: 401, message: "请先登录" }, { status: 401, headers: noStoreHeaders });
  const parsed = revokeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: 400, message: "密钥参数不正确" }, { status: 400, headers: noStoreHeaders });
  const key = await prisma.apiKey.findFirst({ where: { id: parsed.data.id, app: { tenant: { memberships: { some: { userId: user.id } } } } }, include: { app: true } });
  if (!key) return Response.json({ code: 404, message: "密钥不存在或无权访问" }, { status: 404, headers: noStoreHeaders });
  const revoked = await prisma.$transaction(async (transaction) => {
    const result = await transaction.apiKey.updateMany({ where: { id: key.id, status: "ACTIVE" }, data: { status: "REVOKED" } });
    if (result.count === 0) return false;
    await transaction.auditLog.create({ data: { tenantId: key.app.tenantId, actorId: user.id, action: "api-key.revoke", resource: "api-key", resourceId: key.id, metadata: { prefix: key.prefix } } });
    return true;
  });
  if (!revoked) return Response.json({ code: 409, message: "密钥已经失效" }, { status: 409, headers: noStoreHeaders });
  return Response.json({ code: 200, message: "密钥已撤销" }, { headers: noStoreHeaders });
}
