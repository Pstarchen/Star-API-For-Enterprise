import { connection } from "next/server";
import { IntegrationSettingsForm } from "@/components/integration-settings-form";
import { integrationSummaries } from "@/lib/server/integrations";

export default async function AdminPaymentSettingsPage() {
  await connection();
  return <div className="pb-10"><IntegrationSettingsForm initial={await integrationSummaries()} keys={["alipay", "wechat", "bank-transfer", "code-pay"]} eyebrow="DIRECT PAYMENT CHANNELS" title="直连与人工收款" description="支付宝、微信采用官方直连接口；码支付和对公转账采用展示收款信息与管理员核验到账。" /></div>;
}
