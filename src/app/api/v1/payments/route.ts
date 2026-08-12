import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser, getCurrentWorkspace } from "@/lib/server/auth";
import { getIntegration } from "@/lib/server/integrations";
import { getPlatformConfig } from "@/lib/server/installation";
import { createAlipayUrl, createWechatNative, paymentOrderNo } from "@/lib/server/payments";
import { prisma } from "@/lib/server/prisma";
import { noStoreHeaders } from "@/lib/server/request";

const schema = z.object({
  orderType: z.enum(["INVOICE", "RECHARGE"]).default("INVOICE"),
  invoiceId: z.string().min(1).optional(),
  amount: z.string().regex(/^\d{1,9}(\.\d{1,2})?$/, "金额格式不正确").optional(),
  channel: z.enum(["ALIPAY", "WECHAT", "BANK_TRANSFER", "CODE_PAY"]),
}).strict();

export async function POST(request: Request) {
  const user = await getCurrentUser(); if (!user) return Response.json({ code: 401, message: "请先登录" }, { status: 401, headers: noStoreHeaders });
  const workspace = await getCurrentWorkspace(user); if (!workspace) return Response.json({ code: 409, message: "当前账号没有工作区" }, { status: 409, headers: noStoreHeaders });
  const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return Response.json({ code: 400, message: "支付参数不正确" }, { status: 400, headers: noStoreHeaders });
  const invoice = parsed.data.orderType === "INVOICE"
    ? await prisma.invoice.findFirst({ where: { id: parsed.data.invoiceId, tenantId: workspace.tenantId, status: "ISSUED" } })
    : null;
  if (parsed.data.orderType === "INVOICE" && !invoice) return Response.json({ code: 404, message: "待支付账单不存在" }, { status: 404, headers: noStoreHeaders });
  const amount = parsed.data.orderType === "RECHARGE" ? new Prisma.Decimal(parsed.data.amount ?? "0") : invoice!.amount;
  if (amount.lte(0)) return Response.json({ code: 400, message: "充值金额必须大于 0" }, { status: 400, headers: noStoreHeaders });
  const key = parsed.data.channel === "ALIPAY" ? "alipay" : parsed.data.channel === "WECHAT" ? "wechat" : parsed.data.channel === "CODE_PAY" ? "code-pay" : "bank-transfer";
  const integration = await getIntegration(key, true); if (!integration.enabled || !integration.configured) return Response.json({ code: 409, message: "所选收款渠道尚未启用或配置不完整" }, { status: 409, headers: noStoreHeaders });
  const platform = await getPlatformConfig(); const orderNo = paymentOrderNo(); const subject = parsed.data.orderType === "RECHARGE" ? `${platform.name} 账户余额充值` : `${platform.name} 账单 ${invoice!.period}`; let paymentUrl: string | null = null;
  try {
    if (parsed.data.channel === "ALIPAY") paymentUrl = createAlipayUrl({ gatewayUrl: String(integration.publicConfig.gatewayUrl), appId: String(integration.publicConfig.appId), privateKey: String(integration.secrets.privateKey), notifyUrl: String(integration.publicConfig.notifyUrl), returnUrl: `${platform.publicUrl}/console/billing?payment=returned`, orderNo, amount: amount.toFixed(2), subject });
    if (parsed.data.channel === "WECHAT") paymentUrl = await createWechatNative({ appId: String(integration.publicConfig.appId), merchantId: String(integration.publicConfig.merchantId), serialNo: String(integration.publicConfig.serialNo), privateKey: String(integration.secrets.privateKey), notifyUrl: String(integration.publicConfig.notifyUrl), orderNo, amountFen: Math.round(Number(amount) * 100), description: subject });
    if (parsed.data.channel === "CODE_PAY") paymentUrl = typeof integration.publicConfig.paymentUrl === "string" ? integration.publicConfig.paymentUrl : null;
  } catch { return Response.json({ code: 502, message: "支付渠道下单失败，请检查渠道配置" }, { status: 502, headers: noStoreHeaders }); }
  const order = await prisma.paymentOrder.create({ data: { orderNo, tenantId: workspace.tenantId, orderType: parsed.data.orderType, invoiceId: invoice?.id, channel: parsed.data.channel, amount, subject, paymentUrl, expiresAt: new Date(Date.now() + 30 * 60 * 1000) } });
  return Response.json({ code: 201, message: "支付订单已创建", data: { id: order.id, orderNo, orderType: order.orderType, channel: order.channel, amount: order.amount.toString(), paymentUrl, bank: parsed.data.channel === "BANK_TRANSFER" ? integration.publicConfig : null, codePay: parsed.data.channel === "CODE_PAY" ? integration.publicConfig : null, expiresAt: order.expiresAt?.toISOString() } }, { status: 201, headers: noStoreHeaders });
}
