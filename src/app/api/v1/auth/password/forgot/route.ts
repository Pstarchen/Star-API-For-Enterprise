import { z } from "zod";
import { checkEmailVerificationThrottle, recordEmailVerificationRequest } from "@/lib/server/auth-throttle";
import { PASSWORD_RESET_EXPIRES_MINUTES } from "@/lib/email-templates";
import { issueEmailAction } from "@/lib/server/email-actions";
import { sendEventEmail } from "@/lib/server/email";
import { getPlatformConfig } from "@/lib/server/installation";
import { prisma } from "@/lib/server/prisma";
import { noStoreHeaders, requestIp } from "@/lib/server/request";

const schema = z.object({ email: z.email().transform((value) => value.trim().toLowerCase()) }).strict();

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: 400, message: "请输入有效邮箱" }, { status: 400, headers: noStoreHeaders });
  const ipAddress = requestIp(request);
  if (await checkEmailVerificationThrottle(`password-reset:${parsed.data.email}`, ipAddress)) return Response.json({ code: 429, message: "请求过于频繁，请 15 分钟后再试" }, { status: 429, headers: { ...noStoreHeaders, "Retry-After": "900" } });
  await recordEmailVerificationRequest(`password-reset:${parsed.data.email}`, ipAddress);
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email }, select: { id: true, name: true, email: true, status: true, passwordHash: true } });
  if (!user || user.status !== "ACTIVE" || !user.passwordHash) return Response.json({ code: 200, message: "如果该邮箱可重置密码，邮件已发送" }, { headers: noStoreHeaders });
  const token = await issueEmailAction({ purpose: "PASSWORD_RESET", userId: user.id, expiresInMinutes: PASSWORD_RESET_EXPIRES_MINUTES, format: "token" });
  const platform = await getPlatformConfig();
  const resetUrl = new URL(`/reset-password?token=${encodeURIComponent(token)}`, platform.publicUrl || new URL(request.url).origin).toString();
  try {
    await sendEventEmail("password-reset", user.email, user.name, { reset_url: resetUrl, expires_in_minutes: String(PASSWORD_RESET_EXPIRES_MINUTES) });
  } catch {
    return Response.json({ code: 502, message: "密码重置邮件发送失败，请稍后重试" }, { status: 502, headers: noStoreHeaders });
  }
  return Response.json({ code: 200, message: "如果该邮箱可重置密码，邮件已发送" }, { headers: noStoreHeaders });
}
