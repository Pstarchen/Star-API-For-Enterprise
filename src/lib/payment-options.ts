export const epayPaymentTypes = ["alipay", "wxpay", "qqpay"] as const;

export type EpayPaymentType = (typeof epayPaymentTypes)[number];
export const epaySubmissionModes = ["REDIRECT", "API"] as const;
export type EpaySubmissionMode = (typeof epaySubmissionModes)[number];
export const epayProtocolProfiles = ["ID0_STANDARD", "GENERIC_EPAY"] as const;
export type EpayProtocolProfile = (typeof epayProtocolProfiles)[number];
export type PaymentChannelValue = "ALIPAY" | "WECHAT" | "BANK_TRANSFER" | "CODE_PAY" | "EPAY";
export type DirectPaymentChannelKey = "alipay" | "wechat" | "bank-transfer" | "code-pay";

export type PaymentProviderOption = {
  id: string;
  name: string;
  paymentTypes: EpayPaymentType[];
  feeRate: string;
  minAmount: string;
  maxAmount: string;
};

export const paymentChannelNames: Record<PaymentChannelValue, string> = {
  ALIPAY: "支付宝直连",
  WECHAT: "微信支付直连",
  BANK_TRANSFER: "对公转账",
  CODE_PAY: "码支付",
  EPAY: "易支付",
};

export const epayPaymentTypeNames: Record<EpayPaymentType, string> = {
  alipay: "支付宝",
  wxpay: "微信支付",
  qqpay: "QQ 钱包",
};

export const epaySubmissionModeNames: Record<EpaySubmissionMode, string> = {
  REDIRECT: "页面跳转（submit.php）",
  API: "API 下单（mapi.php）",
};

export const epayProtocolProfileNames: Record<EpayProtocolProfile, string> = {
  ID0_STANDARD: "pay.id0.cn 标准协议",
  GENERIC_EPAY: "兼容易支付协议",
};

export function epayProtocolProfileForGateway(gatewayUrl: string): EpayProtocolProfile {
  return new URL(gatewayUrl).hostname.toLowerCase() === "pay.id0.cn" ? "ID0_STANDARD" : "GENERIC_EPAY";
}

export function isEpayPaymentTypeSupported(profile: EpayProtocolProfile, type: EpayPaymentType) {
  return profile !== "ID0_STANDARD" || type === "alipay" || type === "wxpay";
}

export function directChannelValue(key: DirectPaymentChannelKey): Exclude<PaymentChannelValue, "EPAY"> {
  if (key === "alipay") return "ALIPAY";
  if (key === "wechat") return "WECHAT";
  if (key === "code-pay") return "CODE_PAY";
  return "BANK_TRANSFER";
}
