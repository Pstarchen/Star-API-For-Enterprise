import { Prisma } from "@prisma/client";
import { z } from "zod";
import { createSession } from "@/lib/server/auth";
import { getAuthPolicy } from "@/lib/server/auth-policy";
import { checkEmailVerificationThrottle, recordEmailVerificationRequest } from "@/lib/server/auth-throttle";
import { sendVerificationEmail, smtpDeliveryMessage } from "@/lib/server/email";
import { createQqEmailCode, hashQqEmailCode, hashQqPendingToken, isInternalQqEmail, isLegacyQqSyntheticEmail, QQ_EMAIL_CODE_EXPIRES_MINUTES } from "@/lib/server/qq-pending";
import { prisma } from "@/lib/server/prisma";
import { noStoreHeaders, requestIp } from "@/lib/server/request";

const tokenSchema = z.string().trim().min(20).max(200);
const emailSchema = z.email().transform((value) => value.trim().toLowerCase());
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("send"), token: tokenSchema, email: emailSchema }).strict(),
  z.object({ action: z.literal("verify"), token: tokenSchema, email: emailSchema, code: z.string().trim().regex(/^\d{6}$/) }).strict(),
]);

class QqBindError extends Error {
  constructor(public readonly code: string) { super(code); }
}

function errorResponse(status: number, message: string, code: number | string = status) {
  return Response.json({ code, message }, { status, headers: noStoreHeaders });
}

async function findPending(token: string) {
  return prisma.oAuthPendingLogin.findUnique({ where: { tokenHash: hashQqPendingToken(token) } });
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "请输入有效邮箱、令牌和验证码");
  const input = parsed.data;
  const pending = await findPending(input.token);
  if (!pending || pending.expiresAt <= new Date()) return errorResponse(410, "QQ 登录已过期，请返回登录页重新开始", "qq_bind_expired");
  if (isInternalQqEmail(input.email)) return errorResponse(400, "请使用真实邮箱地址");

  if (input.action === "send") {
    const ipAddress = requestIp(request);
    if (await checkEmailVerificationThrottle(input.email, ipAddress)) return Response.json({ code: 429, message: "验证邮件发送过于频繁，请 15 分钟后再试" }, { status: 429, headers: { ...noStoreHeaders, "Retry-After": "900" } });
    await recordEmailVerificationRequest(input.email, ipAddress);
    const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { status: true } });
    if (existing?.status === "SUSPENDED") return errorResponse(409, "该邮箱对应的账号已被冻结", "account_suspended");
    const verification = createQqEmailCode();
    const updated = await prisma.oAuthPendingLogin.updateMany({
      where: { id: pending.id, expiresAt: { gt: new Date() } },
      data: { email: input.email, emailCodeHash: verification.codeHash, emailCodeExpiresAt: new Date(Date.now() + QQ_EMAIL_CODE_EXPIRES_MINUTES * 60 * 1000) },
    });
    if (updated.count !== 1) return errorResponse(410, "QQ 登录已过期，请返回登录页重新开始", "qq_bind_expired");
    try {
      await sendVerificationEmail({ to: input.email, recipientName: pending.username || input.email, code: verification.code });
    } catch (error) {
      return errorResponse(502, smtpDeliveryMessage(error), "email_delivery_failed");
    }
    return Response.json({ code: 200, message: "验证码已发送，请查收邮件" }, { headers: noStoreHeaders });
  }

  const now = new Date();
  if (pending.email !== input.email || !pending.emailCodeHash || pending.emailCodeHash !== hashQqEmailCode(input.code) || !pending.emailCodeExpiresAt || pending.emailCodeExpiresAt <= now) {
    return errorResponse(409, "验证码无效、已使用或已过期", "qq_email_code_invalid");
  }

  const authPolicy = await getAuthPolicy();
  try {
    const result = await prisma.$transaction(async (transaction) => {
      const current = await transaction.oAuthPendingLogin.findUnique({ where: { tokenHash: hashQqPendingToken(input.token) } });
      if (!current || current.expiresAt <= now || current.email !== input.email || current.emailCodeHash !== hashQqEmailCode(input.code) || !current.emailCodeExpiresAt || current.emailCodeExpiresAt <= now) throw new QqBindError("qq_email_code_invalid");

      const linked = await transaction.oAuthAccount.findUnique({ where: { provider_providerAccountId: { provider: current.provider, providerAccountId: current.providerAccountId } }, include: { user: true } });
      if (linked?.user.status === "SUSPENDED") throw new QqBindError("account_suspended");
      let user = await transaction.user.findUnique({ where: { email: input.email } });
      if (user?.status === "SUSPENDED") throw new QqBindError("account_suspended");
      if (linked && user && linked.userId !== user.id) throw new QqBindError("qq_account_conflict");

      if (linked) {
        user = linked.user;
        if (user.email !== input.email && user.emailVerifiedAt && !isLegacyQqSyntheticEmail(user.email)) throw new QqBindError("qq_account_conflict");
        user = await transaction.user.update({ where: { id: user.id }, data: { email: input.email, emailVerifiedAt: now, emailVerificationRequired: false, lastLoginAt: now } });
        await transaction.oAuthAccount.update({ where: { id: linked.id }, data: { username: current.username } });
      } else {
        if (!user) {
          if (!authPolicy.registrationEnabled) throw new QqBindError("registration_disabled");
          user = await transaction.user.create({ data: { email: input.email, name: current.username || "QQ 用户", accountType: "PERSONAL", emailVerifiedAt: now, emailVerificationRequired: false, lastLoginAt: now } });
          const tenant = await transaction.tenant.create({ data: { name: `${user.name}的个人空间`, type: "PERSONAL", status: "ACTIVE" } });
          await transaction.membership.create({ data: { userId: user.id, tenantId: tenant.id, role: "OWNER" } });
        } else {
          user = await transaction.user.update({ where: { id: user.id }, data: { emailVerifiedAt: now, emailVerificationRequired: false, lastLoginAt: now } });
        }
        await transaction.oAuthAccount.create({ data: { userId: user.id, provider: current.provider, providerAccountId: current.providerAccountId, username: current.username } });
      }

      await transaction.auditLog.create({ data: { actorId: user.id, action: "auth.qq.link", resource: "user", resourceId: user.id, ipAddress: requestIp(request), metadata: { qqNickname: current.username || "QQ 用户", emailVerified: true } } });
      await transaction.oAuthPendingLogin.delete({ where: { id: current.id } });
      return { userId: user.id, platformRole: user.platformRole, redirectPath: current.redirectPath };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    await createSession(result.userId, true);
    const fallback = result.platformRole === "ADMIN" ? "/admin" : "/console";
    const next = result.platformRole === "ADMIN" && result.redirectPath === "/console" ? "/admin" : (result.redirectPath.startsWith("/") && !result.redirectPath.startsWith("//") ? result.redirectPath : fallback);
    return Response.json({ code: 200, message: "邮箱验证成功，正在登录", data: { next } }, { headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof QqBindError) {
      const messages: Record<string, string> = { qq_email_code_invalid: "验证码无效、已使用或已过期", account_suspended: "该账号已被冻结", qq_account_conflict: "该 QQ 账号已绑定其他邮箱账号", registration_disabled: "平台当前已关闭新用户注册" };
      const status = error.code === "registration_disabled" ? 403 : error.code === "account_suspended" ? 409 : 409;
      return errorResponse(status, messages[error.code] ?? "QQ 邮箱绑定失败", error.code);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return errorResponse(409, "该邮箱或 QQ 账号已绑定其他账号", "qq_account_conflict");
    return errorResponse(500, "QQ 邮箱绑定失败，请稍后重试", "qq_bind_failed");
  }
}
