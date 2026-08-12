import "server-only";

import { Prisma } from "@prisma/client";
import { defaultEmailSettings, emailEventDefinitions, emailEventIds, type EmailEventId, type EmailSettings, type EmailTemplatePlaceholder } from "@/lib/email-templates";
import { getPlatformConfig } from "@/lib/server/installation";
import { prisma } from "@/lib/server/prisma";

const EMAIL_SETTINGS_KEY = "email-settings";

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function getEmailSettings(): Promise<EmailSettings> {
  const setting = await prisma.platformSetting.findUnique({ where: { key: EMAIL_SETTINGS_KEY } });
  const value = objectValue(setting?.value);
  const templates = objectValue(value.templates);
  const legacyVerification = objectValue(value.verification);
  const alerts = objectValue(value.alerts);
  const legacyLowBalance = objectValue(value.lowBalance);
  return {
    templates: Object.fromEntries(emailEventIds.map((eventId) => {
      const saved = objectValue(templates[eventId]);
      const legacy = eventId === "email-verification" ? legacyVerification : {};
      return [eventId, {
        subject: typeof saved.subject === "string" && saved.subject.trim() ? saved.subject : typeof legacy.subject === "string" && legacy.subject.trim() ? legacy.subject : defaultEmailSettings.templates[eventId].subject,
        html: typeof saved.html === "string" && saved.html.trim() ? saved.html : typeof legacy.html === "string" && legacy.html.trim() ? legacy.html : defaultEmailSettings.templates[eventId].html,
      }];
    })) as Record<EmailEventId, { subject: string; html: string }>,
    alerts: {
      lowBalanceEnabled: alerts.lowBalanceEnabled === true || legacyLowBalance.enabled === true,
      lowBalanceThreshold: typeof alerts.lowBalanceThreshold === "string" && /^\d{1,9}(\.\d{1,6})?$/.test(alerts.lowBalanceThreshold) ? alerts.lowBalanceThreshold : typeof legacyLowBalance.threshold === "string" ? legacyLowBalance.threshold : defaultEmailSettings.alerts.lowBalanceThreshold,
      rechargeUrl: typeof alerts.rechargeUrl === "string" ? alerts.rechargeUrl : typeof legacyLowBalance.rechargeUrl === "string" ? legacyLowBalance.rechargeUrl : "",
      quotaAlertEnabled: alerts.quotaAlertEnabled !== false,
      quotaThresholdPercent: typeof alerts.quotaThresholdPercent === "number" && alerts.quotaThresholdPercent >= 1 && alerts.quotaThresholdPercent <= 100 ? alerts.quotaThresholdPercent : defaultEmailSettings.alerts.quotaThresholdPercent,
    },
  };
}

export async function saveEmailSettings(settings: EmailSettings) {
  return prisma.platformSetting.upsert({
    where: { key: EMAIL_SETTINGS_KEY },
    create: { key: EMAIL_SETTINGS_KEY, value: settings as unknown as Prisma.InputJsonValue },
    update: { value: settings as unknown as Prisma.InputJsonValue },
  });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

export function renderEmailTemplate(template: string, values: Partial<Record<EmailTemplatePlaceholder, string>>, html = false) {
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (source, key: string) => {
    const value = values[key as EmailTemplatePlaceholder];
    if (value === undefined) return source;
    return html ? escapeHtml(value) : value;
  });
}

const previewValues: Record<EmailTemplatePlaceholder, string> = {
  site_name: "Star-API", recipient_name: "测试用户", recipient_email: "test@example.com", verification_code: "628419", expires_in_minutes: "10", reset_url: "https://api.example.com/reset-password?token=preview",
  current_balance: "0.08", threshold: "0.10", recharge_url: "https://api.example.com/console/billing", unsubscribe_url: "https://api.example.com/console/settings",
  recharge_amount: "100.00", order_id: "STAR202608120001", account_id: "app_01HZX", account_name: "生产应用", platform: "Star-API",
  quota_dimension: "月调用次数", quota_used: "8,000", quota_limit: "10,000", quota_remaining: "2,000", quota_threshold: "80%",
};

export async function renderEventEmail(eventId: EmailEventId, input: { recipientName: string; recipientEmail: string; values?: Partial<Record<EmailTemplatePlaceholder, string>>; preview?: boolean }) {
  const [settings, platform] = await Promise.all([getEmailSettings(), getPlatformConfig()]);
  const values = {
    ...(input.preview ? previewValues : {}),
    site_name: platform.name,
    recipient_name: input.recipientName,
    recipient_email: input.recipientEmail,
    platform: platform.name,
    ...input.values,
  } satisfies Partial<Record<EmailTemplatePlaceholder, string>>;
  const template = settings.templates[eventId];
  return {
    subject: renderEmailTemplate(template.subject, values),
    html: renderEmailTemplate(template.html, values, true),
  };
}

export function eventPlaceholderValues(eventId: EmailEventId) {
  return Object.fromEntries(emailEventDefinitions[eventId].placeholders.map((key) => [key, previewValues[key]])) as Partial<Record<EmailTemplatePlaceholder, string>>;
}
