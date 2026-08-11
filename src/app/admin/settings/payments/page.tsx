import { connection } from "next/server";
import { IntegrationSettingsForm } from "@/components/integration-settings-form";
import { integrationSummaries } from "@/lib/server/integrations";

export default async function AdminPaymentSettingsPage() {
  await connection();
  return <div className="pb-10"><IntegrationSettingsForm initial={await integrationSummaries()} keys={["alipay", "wechat", "bank-transfer"]} eyebrow="PAYMENT CHANNELS" title="支付设置" description="集中配置在线支付与对公转账渠道，启用前必须完成对应凭据与回调地址。" /></div>;
}
