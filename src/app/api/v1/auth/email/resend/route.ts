import { z } from "zod";
import { getAuthPolicy } from "@/lib/server/auth-policy";
import { checkEmailVerificationThrottle, recordEmailVerificationRequest } from "@/lib/server/auth-throttle";
import { issueEmailVerificationCode } from "@/lib/server/email-verification";
import { sendVerificationEmail } from "@/lib/server/email";
import { isInstalled } from "@/lib/server/installation";
import { prisma } from "@/lib/server/prisma";
import { noStoreHeaders, requestIp } from "@/lib/server/request";

const schema = z.object({ email: z.email().transform((value) => value.trim().toLowerCase()) }).strict();

export async function POST(request: Request) {
  if (!(await isInstalled())) return Response.json({ code: 503, message: "平台尚未完成初始化" }, { status: 503, headers: noStoreHeaders });
  const policy = await getAuthPolicy();
  if (!policy.registrationEmailVerificationRequired) return Response.json({ code: 409, message: "平台当前未开启注册邮箱验证" }, { status: 409, headers: noStoreHeaders });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: 400, message: "请输入有效邮箱" }, { status: 400, headers: noStoreHeaders });
  const ipAddress = requestIp(request);
  if (await checkEmailVerificationThrottle(parsed.data.email, ipAddress)) return Response.json({ code: 429, message: "验证邮件发送过于频繁，请 15 分钟后再试" }, { status: 429, headers: { ...noStoreHeaders, "Retry-After": "900" } });
  await recordEmailVerificationRequest(parsed.data.email, ipAddress);
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email }, select: { id: true, name: true, email: true, emailVerifiedAt: true } });
  if (!user || user.emailVerifiedAt) return Response.json({ code: 200, message: "如果该邮箱需要验证，新的邮件已发送" }, { headers: noStoreHeaders });
  const code = await issueEmailVerificationCode(user.id);
  try {
    await sendVerificationEmail({ to: user.email, recipientName: user.name, code });
  } catch {
    return Response.json({ code: 502, message: "验证邮件发送失败，请检查平台 SMTP 配置" }, { status: 502, headers: noStoreHeaders });
  }
  return Response.json({ code: 200, message: "验证邮件已重新发送" }, { headers: noStoreHeaders });
}
