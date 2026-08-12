import { connection } from "next/server";
import { IntegrationSettingsForm } from "@/components/integration-settings-form";
import { integrationSummaries } from "@/lib/server/integrations";

export default async function AdminPaymentSettingsPage() {
  await connection();
  return <div className="pb-10"><IntegrationSettingsForm initial={await integrationSummaries()} keys={["alipay", "wechat", "bank-transfer", "code-pay"]} eyebrow="PAYMENT CHANNELS" title="支付设置" description="集中配置在线支付、码支付与对公转账渠道；码支付采用收款码展示与管理员核验到账，不伪造第三方自动回调。" /></div>;
}
