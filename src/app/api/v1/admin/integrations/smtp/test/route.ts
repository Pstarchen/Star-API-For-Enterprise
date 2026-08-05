import nodemailer from "nodemailer";
import { z } from "zod";
import { getCurrentUser } from "@/lib/server/auth";
import { getIntegration } from "@/lib/server/integrations";
import { noStoreHeaders } from "@/lib/server/request";

const schema = z.object({ recipient: z.email() }).strict();

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ code: 401, message: "请先登录" }, { status: 401, headers: noStoreHeaders });
  if (user.platformRole !== "ADMIN") return Response.json({ code: 403, message: "仅平台管理员可以测试邮件" }, { status: 403, headers: noStoreHeaders });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: 400, message: "测试收件地址不正确" }, { status: 400, headers: noStoreHeaders });
  const smtp = await getIntegration("smtp", true);
  if (!smtp.enabled || !smtp.configured) return Response.json({ code: 409, message: "SMTP 尚未启用或配置不完整" }, { status: 409, headers: noStoreHeaders });
  const host = typeof smtp.publicConfig.host === "string" ? smtp.publicConfig.host : "";
  const port = Number(smtp.publicConfig.port);
  const username = typeof smtp.publicConfig.username === "string" ? smtp.publicConfig.username : "";
  const password = typeof smtp.secrets.password === "string" ? smtp.secrets.password : "";
  const fromEmail = typeof smtp.publicConfig.fromEmail === "string" ? smtp.publicConfig.fromEmail : username;
  const fromName = typeof smtp.publicConfig.fromName === "string" ? smtp.publicConfig.fromName : "Star-API";
  if (!host || !port || !username || !password || !fromEmail) return Response.json({ code: 409, message: "SMTP 配置不完整" }, { status: 409, headers: noStoreHeaders });
  try {
    const transport = nodemailer.createTransport({ host, port, secure: smtp.publicConfig.secure === true, auth: { user: username, pass: password }, connectionTimeout: 10000, socketTimeout: 15000 });
    await transport.sendMail({ from: { name: fromName, address: fromEmail }, to: parsed.data.recipient, subject: "Star-API 邮件服务测试", text: `这是一封真实的 SMTP 配置测试邮件。发送时间：${new Date().toISOString()}` });
    return Response.json({ code: 200, message: "测试邮件已发送" }, { headers: noStoreHeaders });
  } catch {
    return Response.json({ code: 502, message: "SMTP 发送失败，请检查服务器、端口、加密方式和凭据" }, { status: 502, headers: noStoreHeaders });
  }
}
