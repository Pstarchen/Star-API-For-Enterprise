import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser, getCurrentWorkspace } from "@/lib/server/auth";
import { checkEmailVerificationThrottle, recordEmailVerificationRequest } from "@/lib/server/auth-throttle";
import { EMAIL_VERIFICATION_EXPIRES_MINUTES } from "@/lib/email-templates";
import { consumeEmailAction, issueEmailAction } from "@/lib/server/email-actions";
import { sendEventEmail, smtpDeliveryMessage } from "@/lib/server/email";
import { prisma } from "@/lib/server/prisma";
import { noStoreHeaders, requestIp } from "@/lib/server/request";

const schema = z.object({ name: z.string().trim().min(2).max(100), creditCode: z.preprocess((value) => value == null ? "" : value, z.string().trim().max(32)), notificationEmail: z.union([z.email(), z.literal("")]).transform((value) => value.trim().toLowerCase()), notificationCode: z.string().trim().regex(/^\d{6}$/).optional(), timezone: z.enum(["Asia/Shanghai", "UTC"]), quotaAlerts: z.boolean(), balanceAlerts: z.boolean() }).strict();

function tenantUpdate(input: z.infer<typeof schema>, enterprise: boolean) {
  return { name: input.name, notificationEmail: input.notificationEmail || null, timezone: input.timezone, quotaAlerts: input.quotaAlerts, balanceAlerts: input.balanceAlerts, ...(enterprise ? { creditCode: input.creditCode || null } : {}) };
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser(); if (!user) return Response.json({ code: 401, message: "请先登录" }, { status: 401, headers: noStoreHeaders });
  const workspace = await getCurrentWorkspace(user); if (!workspace) return Response.json({ code: 409, message: "当前账号没有工作区" }, { status: 409, headers: noStoreHeaders });
  if (!["OWNER", "ADMIN"].includes(workspace.role)) return Response.json({ code: 403, message: "仅 Owner 或管理员可以修改工作区设置" }, { status: 403, headers: noStoreHeaders });
  const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return Response.json({ code: 400, message: "工作区配置不完整", details: z.flattenError(parsed.error) }, { status: 400, headers: noStoreHeaders });
  const currentEmail = workspace.tenant.notificationEmail?.toLowerCase() ?? "";
  const emailChanged = parsed.data.notificationEmail !== currentEmail;
  if (emailChanged && parsed.data.notificationEmail && !parsed.data.notificationCode) {
    const throttleKey = `notification-email:${workspace.tenantId}:${parsed.data.notificationEmail}`;
    const ipAddress = requestIp(request);
    if (await checkEmailVerificationThrottle(throttleKey, ipAddress)) return Response.json({ code: 429, message: "验证码发送过于频繁，请 15 分钟后再试" }, { status: 429, headers: { ...noStoreHeaders, "Retry-After": "900" } });
    await recordEmailVerificationRequest(throttleKey, ipAddress);
    const code = await issueEmailAction({ purpose: "NOTIFICATION_EMAIL", userId: user.id, tenantId: workspace.tenantId, targetEmail: parsed.data.notificationEmail, expiresInMinutes: EMAIL_VERIFICATION_EXPIRES_MINUTES, format: "code" });
    try {
      await sendEventEmail("notification-email-verification", parsed.data.notificationEmail, user.name, { verification_code: code, expires_in_minutes: String(EMAIL_VERIFICATION_EXPIRES_MINUTES) });
    } catch (error) {
      await prisma.emailActionToken.deleteMany({ where: { purpose: "NOTIFICATION_EMAIL", userId: user.id, tenantId: workspace.tenantId, targetEmail: parsed.data.notificationEmail, usedAt: null } });
      return Response.json({ code: 502, message: smtpDeliveryMessage(error) }, { status: 502, headers: noStoreHeaders });
    }
    return Response.json({ code: 202, message: `验证码已发送至 ${parsed.data.notificationEmail}`, data: { verificationRequired: true, targetEmail: parsed.data.notificationEmail } }, { status: 202, headers: noStoreHeaders });
  }
  try {
    const update = async (transaction: Prisma.TransactionClient) => {
      const updated = await transaction.tenant.update({ where: { id: workspace.tenantId }, data: tenantUpdate(parsed.data, workspace.tenant.type === "ENTERPRISE") });
      await transaction.auditLog.create({ data: { tenantId: workspace.tenantId, actorId: user.id, action: "tenant.settings.update", resource: "tenant", resourceId: workspace.tenantId, metadata: { name: parsed.data.name, timezone: parsed.data.timezone, quotaAlerts: parsed.data.quotaAlerts }, ipAddress: requestIp(request) } });
      return updated;
    };
    const tenant = emailChanged && parsed.data.notificationEmail
      ? await consumeEmailAction({ purpose: "NOTIFICATION_EMAIL", raw: parsed.data.notificationCode ?? "", userId: user.id, tenantId: workspace.tenantId, targetEmail: parsed.data.notificationEmail }, async (transaction) => update(transaction))
      : await prisma.$transaction(update);
    return Response.json({ code: 200, message: "工作区设置已保存", data: { name: tenant.name, creditCode: tenant.creditCode, notificationEmail: tenant.notificationEmail, timezone: tenant.timezone, quotaAlerts: tenant.quotaAlerts, balanceAlerts: tenant.balanceAlerts } }, { headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof Error && error.message === "EMAIL_ACTION_INVALID") return Response.json({ code: 409, message: "通知邮箱验证码无效、已使用或已过期" }, { status: 409, headers: noStoreHeaders });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ code: 409, message: "统一社会信用代码已被其他企业使用" }, { status: 409, headers: noStoreHeaders });
    return Response.json({ code: 500, message: "工作区设置保存失败" }, { status: 500, headers: noStoreHeaders });
  }
}
