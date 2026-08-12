import { z } from "zod";
import { getCurrentUser } from "@/lib/server/auth";
import { sendPlatformEmail, smtpDeliveryMessage } from "@/lib/server/email";
import { noStoreHeaders } from "@/lib/server/request";

const schema = z.object({ recipient: z.email() }).strict();

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ code: 401, message: "请先登录" }, { status: 401, headers: noStoreHeaders });
  if (user.platformRole !== "ADMIN") return Response.json({ code: 403, message: "仅平台管理员可以测试邮件" }, { status: 403, headers: noStoreHeaders });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: 400, message: "测试收件地址不正确" }, { status: 400, headers: noStoreHeaders });
  try {
    await sendPlatformEmail({ to: parsed.data.recipient, subject: "Star-API 邮件服务测试", text: `这是一封真实的 SMTP 配置测试邮件。发送时间：${new Date().toISOString()}` });
    return Response.json({ code: 200, message: "测试邮件已发送" }, { headers: noStoreHeaders });
  } catch (error) {
    const notConfigured = error instanceof Error && error.message === "SMTP_NOT_CONFIGURED";
    return Response.json({ code: notConfigured ? 409 : 502, message: smtpDeliveryMessage(error) }, { status: notConfigured ? 409 : 502, headers: noStoreHeaders });
  }
}
