import "server-only";

import nodemailer from "nodemailer";
import { renderEventEmail } from "@/lib/server/email-settings";
import type { EmailEventId, EmailTemplatePlaceholder } from "@/lib/email-templates";
import { getIntegration } from "@/lib/server/integrations";

export type SmtpFailureKind = "AUTH" | "CONNECTION" | "TLS" | "RECIPIENT" | "DELIVERY";

export class SmtpDeliveryError extends Error {
  constructor(public readonly kind: SmtpFailureKind) {
    super(`SMTP_${kind}`);
    this.name = "SmtpDeliveryError";
  }
}

function smtpFailure(error: unknown) {
  const value = error as { code?: string; command?: string; responseCode?: number; message?: string };
  if (value?.code === "EAUTH" || value?.responseCode === 535) return new SmtpDeliveryError("AUTH");
  if (/certificate|ssl|tls/i.test(value?.message ?? "")) return new SmtpDeliveryError("TLS");
  if (["ECONNECTION", "ESOCKET", "ETIMEDOUT", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"].includes(value?.code ?? "")) return new SmtpDeliveryError("CONNECTION");
  if (value?.command === "RCPT TO" || [550, 551, 553].includes(value?.responseCode ?? 0)) return new SmtpDeliveryError("RECIPIENT");
  return new SmtpDeliveryError("DELIVERY");
}

async function smtpTransport() {
  const smtp = await getIntegration("smtp", true);
  if (!smtp.enabled || !smtp.configured) throw new Error("SMTP_NOT_CONFIGURED");
  const host = typeof smtp.publicConfig.host === "string" ? smtp.publicConfig.host.trim() : "";
  const port = Number(smtp.publicConfig.port);
  const username = typeof smtp.publicConfig.username === "string" ? smtp.publicConfig.username.trim() : "";
  const password = typeof smtp.secrets.password === "string" ? smtp.secrets.password : "";
  const fromEmail = typeof smtp.publicConfig.fromEmail === "string" ? smtp.publicConfig.fromEmail.trim() : username;
  const fromName = typeof smtp.publicConfig.fromName === "string" && smtp.publicConfig.fromName.trim() ? smtp.publicConfig.fromName.trim() : "Star-API";
  if (!host || !port || !username || !password || !fromEmail) throw new Error("SMTP_NOT_CONFIGURED");
  const secure = port === 465 || smtp.publicConfig.secure === true;
  const transport = nodemailer.createTransport({ host, port, secure, auth: { user: username, pass: password }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000, tls: { servername: host, minVersion: "TLSv1.2" } });
  return { transport, from: { name: fromName, address: fromEmail } };
}

export async function sendPlatformEmail(input: { to: string; subject: string; text: string; html?: string }) {
  const { transport, from } = await smtpTransport();
  try {
    await transport.sendMail({ from, to: input.to, subject: input.subject, text: input.text, ...(input.html ? { html: input.html } : {}) });
  } catch (error) {
    throw smtpFailure(error);
  } finally {
    transport.close();
  }
}

export async function sendVerificationEmail(input: { to: string; recipientName: string; code: string }) {
  return sendEventEmail("email-verification", input.to, input.recipientName, { verification_code: input.code, expires_in_minutes: "10" });
}

export async function sendEventEmail(eventId: EmailEventId, to: string, recipientName: string, values: Partial<Record<EmailTemplatePlaceholder, string>>) {
  const content = await renderEventEmail(eventId, { recipientName, recipientEmail: to, values });
  return sendPlatformEmail({ to, ...content, text: content.subject });
}

export function smtpDeliveryMessage(error: unknown) {
  if (error instanceof Error && error.message === "SMTP_NOT_CONFIGURED") return "SMTP 尚未启用或配置不完整";
  if (!(error instanceof SmtpDeliveryError)) return "邮件发送失败，请稍后重试";
  return {
    AUTH: "SMTP 认证失败，请检查用户名、密码或授权码",
    CONNECTION: "无法连接 SMTP 服务器，请检查主机、端口和网络",
    TLS: "SMTP TLS 握手失败，请检查端口、加密方式和证书",
    RECIPIENT: "SMTP 服务器拒绝了收件地址，请检查收件人邮箱",
    DELIVERY: "SMTP 服务器未接受邮件，请检查发件人和服务商策略",
  }[error.kind];
}
