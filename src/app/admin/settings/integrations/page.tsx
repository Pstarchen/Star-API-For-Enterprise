import { connection } from "next/server";
import { IntegrationSettingsForm } from "@/components/integration-settings-form";
import { EmailTemplateSettings } from "@/components/email-template-settings";
import { getEmailSettings } from "@/lib/server/email-settings";
import { integrationSummaries } from "@/lib/server/integrations";
import { getPlatformConfig } from "@/lib/server/installation";

export default async function AdminIntegrationSettingsPage() {
  await connection();
  const [initial, platform, emailSettings] = await Promise.all([integrationSummaries(), getPlatformConfig(), getEmailSettings()]);
  return <div className="space-y-8 pb-10"><IntegrationSettingsForm initial={initial} publicUrl={platform.publicUrl} keys={["github", "smtp"]} eyebrow="IDENTITY DELIVERY" title="登录与邮件" description="配置 GitHub OAuth 与 SMTP 通知服务；敏感凭据只加密保存，不会回传原文。" /><EmailTemplateSettings initial={emailSettings} /></div>;
}
