import { Prisma } from "@prisma/client";
import { z } from "zod";
import { createEpayUrl } from "@/lib/epay";
import { epayPaymentTypes } from "@/lib/payment-options";
import { getCurrentUser, getCurrentWorkspace } from "@/lib/server/auth";
import { getIntegration } from "@/lib/server/integrations";
import { getPlatformConfig } from "@/lib/server/installation";
import { lockPaymentProvider, paymentProviderSecret } from "@/lib/server/payment-providers";
import { createAlipayUrl, createWechatNative, paymentOrderNo } from "@/lib/server/payments";
import { prisma } from "@/lib/server/prisma";
import { noStoreHeaders } from "@/lib/server/request";

const schema = z.object({
  orderType: z.enum(["INVOICE", "RECHARGE"]).default("INVOICE"),
  invoiceId: z.string().min(1).optional(),
  amount: z.string().regex(/^\d{1,9}(\.\d{1,2})?$/, "金额格式不正确").optional(),
  channel: z.enum(["ALIPAY", "WECHAT", "BANK_TRANSFER", "CODE_PAY", "EPAY"]),
  paymentProviderId: z.string().min(1).optional(),
  paymentType: z.enum(epayPaymentTypes).optional(),
}).strict().superRefine((value, context) => {
  if (value.channel === "EPAY" && (!value.paymentProviderId || !value.paymentType)) {
    context.addIssue({ code: "custom", message: "请选择易支付服务商和支付方式" });
  }
  if (value.channel !== "EPAY" && (value.paymentProviderId || value.paymentType)) {
    context.addIssue({ code: "custom", message: "当前渠道不能指定易支付服务商" });
  }
});

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
  const platform = await getPlatformConfig();
  const orderNo = paymentOrderNo();
  const subject = parsed.data.orderType === "RECHARGE" ? `${platform.name} 账户余额充值` : `${platform.name} 账单 ${invoice!.period}`;
  let paymentUrl: string | null = null;
  let integration: Awaited<ReturnType<typeof getIntegration>> | null = null;
  try {
    if (parsed.data.channel === "EPAY") {
      let publicUrl: URL;
      try {
        publicUrl = new URL(platform.publicUrl);
      } catch {
        return Response.json({ code: 409, message: "平台公网访问地址尚未配置，无法接收易支付回调" }, { status: 409, headers: noStoreHeaders });
      }
      if (!["http:", "https:"].includes(publicUrl.protocol)) return Response.json({ code: 409, message: "平台公网访问地址尚未配置，无法接收易支付回调" }, { status: 409, headers: noStoreHeaders });
      const callbackOrigin = publicUrl.toString().replace(/\/$/, "");
      const result = await prisma.$transaction(async (transaction) => {
        if (!(await lockPaymentProvider(transaction, parsed.data.paymentProviderId!))) throw new Error("EPAY_PROVIDER_UNAVAILABLE");
        const paymentProvider = await transaction.paymentProvider.findUnique({ where: { id: parsed.data.paymentProviderId! } });
        if (!paymentProvider?.enabled) throw new Error("EPAY_PROVIDER_UNAVAILABLE");
        if (!paymentProvider.paymentTypes.includes(parsed.data.paymentType!)) throw new Error("EPAY_PAYMENT_TYPE_UNSUPPORTED");
        if (amount.lt(paymentProvider.minAmount) || amount.gt(paymentProvider.maxAmount)) throw new Error(`EPAY_AMOUNT_RANGE:${paymentProvider.minAmount.toFixed(2)}:${paymentProvider.maxAmount.toFixed(2)}`);
        const nextPaymentUrl = createEpayUrl({
          gatewayUrl: paymentProvider.gatewayUrl,
          merchantPid: paymentProvider.merchantPid,
          merchantKey: paymentProviderSecret(paymentProvider),
          paymentType: parsed.data.paymentType!,
          notifyUrl: `${callbackOrigin}/api/v1/payments/epay/notify/${paymentProvider.id}`,
          returnUrl: `${callbackOrigin}/console/billing?payment=returned`,
          orderNo,
          amount: amount.toFixed(2),
          subject,
        });
        const order = await transaction.paymentOrder.create({ data: { orderNo, tenantId: workspace.tenantId, orderType: parsed.data.orderType, invoiceId: invoice?.id, channel: "EPAY", amount, subject, paymentUrl: nextPaymentUrl, paymentProviderId: paymentProvider.id, providerNameSnapshot: paymentProvider.name, paymentType: parsed.data.paymentType, expiresAt: new Date(Date.now() + 30 * 60 * 1000) } });
        return { order, paymentUrl: nextPaymentUrl };
      });
      return Response.json({ code: 201, message: "支付订单已创建", data: { id: result.order.id, orderNo, orderType: result.order.orderType, channel: result.order.channel, amount: result.order.amount.toString(), paymentUrl: result.paymentUrl, providerName: result.order.providerNameSnapshot, paymentType: result.order.paymentType, bank: null, codePay: null, expiresAt: result.order.expiresAt?.toISOString() } }, { status: 201, headers: noStoreHeaders });
    } else {
      const key = parsed.data.channel === "ALIPAY" ? "alipay" : parsed.data.channel === "WECHAT" ? "wechat" : parsed.data.channel === "CODE_PAY" ? "code-pay" : "bank-transfer";
      integration = await getIntegration(key, true);
      if (!integration.enabled || !integration.configured) return Response.json({ code: 409, message: "所选收款渠道尚未启用或配置不完整" }, { status: 409, headers: noStoreHeaders });
    }
    if (integration) {
      if (parsed.data.channel === "ALIPAY") paymentUrl = createAlipayUrl({ gatewayUrl: String(integration.publicConfig.gatewayUrl), appId: String(integration.publicConfig.appId), privateKey: String(integration.secrets.privateKey), notifyUrl: String(integration.publicConfig.notifyUrl), returnUrl: `${platform.publicUrl}/console/billing?payment=returned`, orderNo, amount: amount.toFixed(2), subject });
      if (parsed.data.channel === "WECHAT") paymentUrl = await createWechatNative({ appId: String(integration.publicConfig.appId), merchantId: String(integration.publicConfig.merchantId), serialNo: String(integration.publicConfig.serialNo), privateKey: String(integration.secrets.privateKey), notifyUrl: String(integration.publicConfig.notifyUrl), orderNo, amountFen: Math.round(Number(amount) * 100), description: subject });
      if (parsed.data.channel === "CODE_PAY") paymentUrl = typeof integration.publicConfig.paymentUrl === "string" ? integration.publicConfig.paymentUrl : null;
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "EPAY_PROVIDER_UNAVAILABLE") return Response.json({ code: 409, message: "所选易支付服务商已停用或不存在" }, { status: 409, headers: noStoreHeaders });
    if (code === "EPAY_PAYMENT_TYPE_UNSUPPORTED") return Response.json({ code: 400, message: "所选服务商不支持该支付方式" }, { status: 400, headers: noStoreHeaders });
    if (code.startsWith("EPAY_AMOUNT_RANGE:")) {
      const [, minAmount, maxAmount] = code.split(":");
      return Response.json({ code: 400, message: `支付金额需在 ¥${minAmount} 至 ¥${maxAmount} 之间` }, { status: 400, headers: noStoreHeaders });
    }
    return Response.json({ code: 502, message: "支付渠道下单失败，请检查渠道配置" }, { status: 502, headers: noStoreHeaders });
  }
  const order = await prisma.paymentOrder.create({ data: { orderNo, tenantId: workspace.tenantId, orderType: parsed.data.orderType, invoiceId: invoice?.id, channel: parsed.data.channel, amount, subject, paymentUrl, expiresAt: new Date(Date.now() + 30 * 60 * 1000) } });
  return Response.json({ code: 201, message: "支付订单已创建", data: { id: order.id, orderNo, orderType: order.orderType, channel: order.channel, amount: order.amount.toString(), paymentUrl, providerName: order.providerNameSnapshot, paymentType: order.paymentType, bank: parsed.data.channel === "BANK_TRANSFER" ? integration?.publicConfig : null, codePay: parsed.data.channel === "CODE_PAY" ? integration?.publicConfig : null, expiresAt: order.expiresAt?.toISOString() } }, { status: 201, headers: noStoreHeaders });
}
