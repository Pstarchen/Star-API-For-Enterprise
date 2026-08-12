import { z } from "zod";
import { defaultEmailSettings, emailEventDefinitions, emailEventIds, emailTemplateUnknownPlaceholders, type EmailEventId } from "@/lib/email-templates";
import { getCurrentUser } from "@/lib/server/auth";
import { eventPlaceholderValues, getEmailSettings, renderEmailTemplate, saveEmailSettings } from "@/lib/server/email-settings";
import { getPlatformConfig } from "@/lib/server/installation";
import { prisma } from "@/lib/server/prisma";
import { noStoreHeaders, requestIp } from "@/lib/server/request";

function templateSchema(eventId: EmailEventId) {
  return z.object({ subject: z.string().trim().min(1).max(240), html: z.string().trim().min(1).max(100_000) }).strict().superRefine((value, context) => {
    const unknown = emailTemplateUnknownPlaceholders(eventId, `${value.subject}\n${value.html}`);
    if (unknown.length) context.addIssue({ code: "custom", path: ["html"], message: `包含不支持的占位符：${unknown.map((item) => `{{${item}}}`).join("、")}` });
  });
}

const settingsSchema = z.object({
  templates: z.record(z.enum(emailEventIds), z.object({ subject: z.string().trim().min(1).max(240), html: z.string().trim().min(1).max(100_000) }).strict()),
  alerts: z.object({
    lowBalanceEnabled: z.boolean(),
    lowBalanceThreshold: z.string().regex(/^\d{1,9}(\.\d{1,6})?$/, "默认提醒阈值格式不正确"),
    rechargeUrl: z.union([z.literal(""), z.url().refine((value) => ["http:", "https:"].includes(new URL(value).protocol), "充值页面 URL 必须使用 HTTP 或 HTTPS")]),
    quotaAlertEnabled: z.boolean(),
    quotaThresholdPercent: z.number().int().min(1).max(100),
  }).strict(),
}).strict().superRefine((value, context) => {
  for (const eventId of emailEventIds) {
    const template = value.templates[eventId];
    if (!template) { context.addIssue({ code: "custom", path: ["templates", eventId], message: `缺少${emailEventDefinitions[eventId].label}模板` }); continue; }
    const unknown = emailTemplateUnknownPlaceholders(eventId, `${template.subject}\n${template.html}`);
    if (unknown.length) context.addIssue({ code: "custom", path: ["templates", eventId], message: `${emailEventDefinitions[eventId].label}包含不支持的占位符：${unknown.map((item) => `{{${item}}}`).join("、")}` });
  }
});

async function authorize() {
  const user = await getCurrentUser();
  if (!user) return { error: Response.json({ code: 401, message: "请先登录" }, { status: 401, headers: noStoreHeaders }) } as const;
  if (user.platformRole !== "ADMIN") return { error: Response.json({ code: 403, message: "仅平台管理员可以管理邮件模板" }, { status: 403, headers: noStoreHeaders }) } as const;
  return { user } as const;
}

export async function GET() {
  const auth = await authorize();
  if ("error" in auth) return auth.error;
  return Response.json({ code: 200, data: await getEmailSettings() }, { headers: noStoreHeaders });
}

export async function PATCH(request: Request) {
  const auth = await authorize();
  if ("error" in auth) return auth.error;
  const parsed = settingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: 400, message: parsed.error.issues[0]?.message ?? "邮件设置格式不正确", details: z.flattenError(parsed.error) }, { status: 400, headers: noStoreHeaders });
  await saveEmailSettings(parsed.data);
  await prisma.auditLog.create({ data: { tenantId: auth.user.memberships[0]?.tenantId, actorId: auth.user.id, action: "email.settings.update", resource: "platform-setting", resourceId: "email-settings", metadata: parsed.data.alerts, ipAddress: requestIp(request) } });
  return Response.json({ code: 200, message: "邮件模板与提醒设置已保存", data: await getEmailSettings() }, { headers: noStoreHeaders });
}

export async function POST(request: Request) {
  const auth = await authorize();
  if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => null) as { action?: unknown; eventId?: unknown; subject?: unknown; html?: unknown } | null;
  const eventId = z.enum(emailEventIds).safeParse(body?.eventId);
  if (!eventId.success) return Response.json({ code: 400, message: "请选择有效的邮件事件" }, { status: 400, headers: noStoreHeaders });
  if (body?.action === "official") return Response.json({ code: 200, data: defaultEmailSettings.templates[eventId.data] }, { headers: noStoreHeaders });
  if (body?.action !== "preview") return Response.json({ code: 400, message: "不支持的邮件设置操作" }, { status: 400, headers: noStoreHeaders });
  const parsed = templateSchema(eventId.data).safeParse({ subject: body.subject, html: body.html });
  if (!parsed.success) return Response.json({ code: 400, message: parsed.error.issues[0]?.message ?? "邮件模板格式不正确" }, { status: 400, headers: noStoreHeaders });
  const platform = await getPlatformConfig();
  const placeholders = { site_name: platform.name, recipient_name: "测试用户", recipient_email: "test@example.com", ...eventPlaceholderValues(eventId.data) };
  return Response.json({ code: 200, data: { subject: renderEmailTemplate(parsed.data.subject, placeholders), html: renderEmailTemplate(parsed.data.html, placeholders, true) } }, { headers: noStoreHeaders });
}
