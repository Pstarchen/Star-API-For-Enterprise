import { z } from "zod";
import { createSession } from "@/lib/server/auth";
import { checkLoginThrottle, clearLoginThrottle, recordFailedLogin } from "@/lib/server/auth-throttle";
import { hashPassword, verifyPassword } from "@/lib/server/password";
import { isInstalled } from "@/lib/server/installation";
import { prisma } from "@/lib/server/prisma";
import { noStoreHeaders, requestIp } from "@/lib/server/request";
import { getAuthPolicy } from "@/lib/server/auth-policy";

const loginSchema = z.object({
  email: z.email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(1).max(72),
  remember: z.boolean().default(false),
});

export async function POST(request: Request) {
  if (!(await isInstalled())) {
    return Response.json({ code: 503, message: "平台尚未完成初始化", data: { next: "/install" } }, { status: 503, headers: noStoreHeaders });
  }
  const authPolicy = await getAuthPolicy();
  if (!authPolicy.passwordLoginEnabled) {
    return Response.json({ code: 403, message: "邮箱密码登录当前已关闭，请使用平台提供的其他登录方式" }, { status: 403, headers: noStoreHeaders });
  }
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ code: 400, message: "请输入有效的邮箱和密码" }, { status: 400, headers: noStoreHeaders });
  }

  const { email, password, remember } = parsed.data;
  const ipAddress = requestIp(request);
  if (await checkLoginThrottle(email, ipAddress)) {
    return Response.json({ code: 429, message: "尝试次数过多，请 15 分钟后再试" }, { status: 429, headers: { ...noStoreHeaders, "Retry-After": "900" } });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const passwordMatches = user?.passwordHash
    ? await verifyPassword(password, user.passwordHash)
    : (await hashPassword(password)) && false;

  if (!user || !passwordMatches || user.status !== "ACTIVE") {
    await recordFailedLogin(email, ipAddress);
    return Response.json({ code: 401, message: "邮箱或密码不正确" }, { status: 401, headers: noStoreHeaders });
  }

  if (authPolicy.registrationEmailVerificationRequired && user.emailVerificationRequired && !user.emailVerifiedAt) {
    return Response.json({ code: 403, message: "请先完成邮箱验证后再登录", data: { emailVerificationRequired: true, email: user.email } }, { status: 403, headers: noStoreHeaders });
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
    prisma.auditLog.create({
      data: { actorId: user.id, action: "auth.login", resource: "session", ipAddress },
    }),
  ]);
  await clearLoginThrottle(email, ipAddress);
  await createSession(user.id, remember);

  return Response.json({
    code: 200,
    message: "登录成功",
    data: { user: { id: user.id, name: user.name, email: user.email, platformRole: user.platformRole } },
  }, { headers: noStoreHeaders });
}
