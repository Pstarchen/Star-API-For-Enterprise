import { createHash, timingSafeEqual } from "node:crypto";
import type { EpayPaymentType } from "@/lib/payment-options";

function canonicalEntries(params: Record<string, string>) {
  return Object.entries(params)
    .filter(([key, value]) => key !== "sign" && key !== "sign_type" && value !== "")
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
}

export function canonicalEpayParams(params: Record<string, string>) {
  return canonicalEntries(params).map(([key, value]) => `${key}=${value}`).join("&");
}

export function signEpayParams(params: Record<string, string>, merchantKey: string) {
  return createHash("md5").update(`${canonicalEpayParams(params)}${merchantKey}`, "utf8").digest("hex");
}

export function verifyEpaySignature(params: Record<string, string>, merchantKey: string) {
  const provided = params.sign?.trim().toLowerCase();
  if (!provided || !/^[a-f0-9]{32}$/.test(provided)) return false;
  const expected = signEpayParams(params, merchantKey);
  return timingSafeEqual(Buffer.from(expected, "ascii"), Buffer.from(provided, "ascii"));
}

export function normalizeEpayGatewayUrl(value: string) {
  const gateway = new URL(value);
  if (!["http:", "https:"].includes(gateway.protocol) || gateway.username || gateway.password || gateway.search || gateway.hash) throw new Error("INVALID_EPAY_GATEWAY");
  if (!gateway.pathname || gateway.pathname === "/") gateway.pathname = "/submit.php";
  else if (gateway.pathname.endsWith("/")) gateway.pathname += "submit.php";
  gateway.search = "";
  gateway.hash = "";
  return gateway.toString();
}

export function normalizeEpayEndpointUrl(value: string, endpoint: "submit" | "mapi") {
  const url = new URL(normalizeEpayGatewayUrl(value));
  const file = endpoint === "mapi" ? "mapi.php" : "submit.php";
  url.pathname = url.pathname.replace(/(?:submit|mapi)\.php$/i, file);
  if (!/(?:submit|mapi)\.php$/i.test(url.pathname)) url.pathname = `${url.pathname.replace(/\/$/, "")}/${file}`;
  return url.toString();
}

export function createEpayUrl(input: {
  gatewayUrl: string;
  merchantPid: string;
  merchantKey: string;
  paymentType: EpayPaymentType;
  notifyUrl: string;
  returnUrl: string;
  orderNo: string;
  amount: string;
  subject: string;
}) {
  const params: Record<string, string> = {
    pid: input.merchantPid,
    type: input.paymentType,
    out_trade_no: input.orderNo,
    notify_url: input.notifyUrl,
    return_url: input.returnUrl,
    name: input.subject,
    money: input.amount,
  };
  const url = new URL(normalizeEpayGatewayUrl(input.gatewayUrl));
  for (const [key, value] of Object.entries({ ...params, sign: signEpayParams(params, input.merchantKey), sign_type: "MD5" })) url.searchParams.set(key, value);
  return url.toString();
}

export type EpayApiPaymentResult = {
  paymentUrl: string | null;
  paymentQrCode: string | null;
  paymentScheme: string | null;
};

export function createEpayApiParams(input: {
  merchantPid: string;
  merchantKey: string;
  paymentType: EpayPaymentType;
  notifyUrl: string;
  returnUrl: string;
  orderNo: string;
  amount: string;
  subject: string;
  clientIp: string;
  device?: "pc" | "mobile" | "qq" | "wechat" | "alipay" | "jump";
}) {
  const params: Record<string, string> = {
    pid: input.merchantPid,
    type: input.paymentType,
    out_trade_no: input.orderNo,
    notify_url: input.notifyUrl,
    return_url: input.returnUrl,
    name: input.subject,
    money: input.amount,
    clientip: input.clientIp,
    device: input.device ?? "pc",
  };
  return { ...params, sign: signEpayParams(params, input.merchantKey), sign_type: "MD5" };
}

export function createEpayRedirectParams(input: {
  merchantPid: string;
  merchantKey: string;
  paymentType: EpayPaymentType;
  notifyUrl: string;
  returnUrl: string;
  orderNo: string;
  amount: string;
  subject: string;
}) {
  const params: Record<string, string> = {
    pid: input.merchantPid,
    type: input.paymentType,
    out_trade_no: input.orderNo,
    notify_url: input.notifyUrl,
    return_url: input.returnUrl,
    name: input.subject,
    money: input.amount,
  };
  return { ...params, sign: signEpayParams(params, input.merchantKey), sign_type: "MD5" };
}

export function parseEpayApiPaymentResult(value: unknown): EpayApiPaymentResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("EPAY_API_INVALID_RESPONSE");
  const result = value as Record<string, unknown>;
  if (String(result.code ?? "") !== "1") throw new Error("EPAY_API_ORDER_FAILED");
  const paymentUrl = typeof result.payurl === "string" && result.payurl.trim() ? result.payurl.trim() : null;
  const paymentQrCode = typeof result.qrcode === "string" && result.qrcode.trim() ? result.qrcode.trim() : null;
  const paymentScheme = typeof result.urlscheme === "string" && result.urlscheme.trim() ? result.urlscheme.trim() : null;
  if (![paymentUrl, paymentQrCode, paymentScheme].filter(Boolean).length) throw new Error("EPAY_API_NO_PAYMENT_TARGET");
  if (paymentUrl && !/^https?:\/\//i.test(paymentUrl)) throw new Error("EPAY_API_INVALID_PAYMENT_URL");
  return { paymentUrl, paymentQrCode, paymentScheme };
}
