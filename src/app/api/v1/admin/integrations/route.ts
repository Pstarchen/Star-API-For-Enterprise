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

function isHttpUrl(value: unknown) {
  if (!value) return true;
  if (typeof value !== "string") return false;
  try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; }
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
  if (input.key === "smtp") {
    const policy = await getAuthPolicy();
    if (policy.registrationEmailVerificationRequired && (!input.enabled || input.secretAction === "remove")) return Response.json({ code: 409, message: "注册邮箱验证正在生效，不能停用 SMTP 或移除邮件凭据" }, { status: 409, headers: noStoreHeaders });
  }
  const previous = await getIntegration(input.key, true);
  const nextSecrets = input.secretAction === "remove" ? {} : input.secretAction === "keep" ? previous.secrets : { ...previous.secrets, ...(input.secrets ?? {}) };
  const secretConfigured = input.key === "bank-transfer" || input.key === "code-pay" || Object.keys(nextSecrets).length > 0;
  const githubClientId = input.key === "github" && typeof input.publicConfig.clientId === "string" ? input.publicConfig.clientId.trim() : "";
  if (input.key === "github" && input.enabled && !githubClientId) return Response.json({ code: 409, message: "启用 GitHub 登录前必须填写 Client ID" }, { status: 409, headers: noStoreHeaders });
  if (input.key === "code-pay" && input.enabled && !input.publicConfig.qrImageUrl && !input.publicConfig.paymentUrl) return Response.json({ code: 409, message: "启用码支付前必须填写收款码图片地址或支付链接" }, { status: 409, headers: noStoreHeaders });
  if (input.key === "code-pay" && (!isHttpUrl(input.publicConfig.qrImageUrl) || !isHttpUrl(input.publicConfig.paymentUrl))) return Response.json({ code: 400, message: "码支付图片地址和支付链接必须使用 HTTP 或 HTTPS" }, { status: 400, headers: noStoreHeaders });
  if (input.key === "bank-transfer" && input.enabled && !input.publicConfig.accountName && !input.publicConfig.accountNumber) return Response.json({ code: 409, message: "启用对公转账前必须填写收款账户信息" }, { status: 409, headers: noStoreHeaders });
  if (input.key === "smtp" && input.enabled && (!input.publicConfig.host || !input.publicConfig.port || !input.publicConfig.fromEmail || !input.publicConfig.username || !nextSecrets.password)) return Response.json({ code: 409, message: "启用 SMTP 前必须填写主机、端口、发件邮箱、用户名和密码" }, { status: 409, headers: noStoreHeaders });
  if (input.key === "alipay" && input.enabled && (!input.publicConfig.appId || !input.publicConfig.gatewayUrl || !input.publicConfig.notifyUrl || !nextSecrets.privateKey || !nextSecrets.alipayPublicKey)) return Response.json({ code: 409, message: "启用支付宝前必须填写应用、网关、回调地址、应用私钥和支付宝公钥" }, { status: 409, headers: noStoreHeaders });
  if (input.key === "wechat" && input.enabled && (!input.publicConfig.merchantId || !input.publicConfig.appId || !input.publicConfig.serialNo || !input.publicConfig.platformSerialNo || !input.publicConfig.notifyUrl || !nextSecrets.privateKey || !nextSecrets.apiV3Key || !nextSecrets.platformPublicKey)) return Response.json({ code: 409, message: "启用微信支付前必须完整填写商户、证书、回调与 API v3 凭据" }, { status: 409, headers: noStoreHeaders });
  if (input.enabled && !secretConfigured) return Response.json({ code: 409, message: "启用前必须填写并保存密钥配置" }, { status: 409, headers: noStoreHeaders });
  await saveIntegration({ key: input.key, enabled: input.enabled, publicConfig: input.publicConfig, secrets: input.secretAction === "remove" ? {} : input.secrets, keepSecrets: input.secretAction === "keep" });
  await prisma.auditLog.create({ data: { tenantId: auth.user.memberships[0]?.tenantId, actorId: auth.user.id, action: "integration.update", resource: "integration", resourceId: input.key, metadata: { enabled: input.enabled, secretAction: input.secretAction }, ipAddress: requestIp(request) } });
  const updated = await getIntegration(input.key);
  return Response.json({ code: 200, message: "集成配置已保存", data: { key: input.key, enabled: updated.enabled, configured: updated.configured, secretConfigured: updated.secretConfigured, publicConfig: updated.publicConfig } }, { headers: noStoreHeaders });
}
