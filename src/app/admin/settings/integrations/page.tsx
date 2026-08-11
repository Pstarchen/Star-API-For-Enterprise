import { connection } from "next/server";
import { IntegrationSettingsForm } from "@/components/integration-settings-form";
import { integrationSummaries } from "@/lib/server/integrations";

export default async function AdminIntegrationSettingsPage() {
  await connection();
  return <div className="pb-10"><IntegrationSettingsForm initial={await integrationSummaries()} keys={["github", "smtp"]} eyebrow="IDENTITY DELIVERY" title="登录与邮件" description="配置 GitHub OAuth 与 SMTP 通知服务；敏感凭据只加密保存，不会回传原文。" /></div>;
}
