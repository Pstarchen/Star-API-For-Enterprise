import { z } from "zod";
import { getCurrentUser } from "@/lib/server/auth";
import { getIntegration, integrationKeys, integrationSummaries, saveIntegration } from "@/lib/server/integrations";
import { prisma } from "@/lib/server/prisma";
import { noStoreHeaders, requestIp } from "@/lib/server/request";
import { getAuthPolicy } from "@/lib/server/auth-policy";

const schema = z.object({
  key: z.enum(integrationKeys),
  enabled: z.boolean(),
  publicConfig: z.record(z.string(), z.union([z.string().max(10000), z.number(), z.boolean()])),
  secrets: z.record(z.string(), z.string().max(20000)).optional(),
  secretAction: z.enum(["keep", "replace", "remove"]),
}).strict();

async function authorize() {
  const user = await getCurrentUser();
  if (!user) return { error: Response.json({ code: 401, message: "请先登录" }, { status: 401, headers: noStoreHeaders }) } as const;
  if (user.platformRole !== "ADMIN") return { error: Response.json({ code: 403, message: "仅平台管理员可以管理集成" }, { status: 403, headers: noStoreHeaders }) } as const;
  return { user } as const;
}

export async function GET() {
  const auth = await authorize();
  if ("error" in auth) return auth.error;
  return Response.json({ data: await integrationSummaries() }, { headers: noStoreHeaders });
}

export async function PATCH(request: Request) {
  const auth = await authorize();
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: 400, message: "集成配置格式不正确", details: z.flattenError(parsed.error) }, { status: 400, headers: noStoreHeaders });
  const input = parsed.data;
  if (input.key === "github" && !input.enabled && !(await getAuthPolicy()).passwordLoginEnabled) {
    return Response.json({ code: 409, message: "邮箱密码登录已关闭，不能停用当前唯一的管理员登录方式" }, { status: 409, headers: noStoreHeaders });
  }
  const previous = await getIntegration(input.key);
  const hasReplacement = input.secretAction === "replace" && Boolean(input.secrets && Object.values(input.secrets).some(Boolean));
  const configured = input.key === "bank-transfer" || (input.secretAction === "keep" ? previous.configured : hasReplacement);
  if (input.enabled && !configured) return Response.json({ code: 409, message: "启用前必须填写并保存密钥配置" }, { status: 409, headers: noStoreHeaders });
  await saveIntegration({ key: input.key, enabled: input.enabled, publicConfig: input.publicConfig, secrets: input.secretAction === "remove" ? {} : input.secrets, keepSecrets: input.secretAction === "keep" });
  await prisma.auditLog.create({ data: { tenantId: auth.user.memberships[0]?.tenantId, actorId: auth.user.id, action: "integration.update", resource: "integration", resourceId: input.key, metadata: { enabled: input.enabled, secretAction: input.secretAction }, ipAddress: requestIp(request) } });
  const updated = await getIntegration(input.key);
  return Response.json({ code: 200, message: "集成配置已保存", data: { key: input.key, enabled: updated.enabled, configured: updated.configured, publicConfig: updated.publicConfig } }, { headers: noStoreHeaders });
}
