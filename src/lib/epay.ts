import { createHash, timingSafeEqual } from "node:crypto";
import type { EpayPaymentType } from "@/lib/payment-options";

export type EpayDevice = "pc" | "mobile" | "qq" | "wechat" | "alipay" | "jump";

export class EpayProtocolError extends Error {
  readonly providerMessage: string;

  constructor(code: string, providerMessage = "") {
    super(code);
    this.name = "EpayProtocolError";
    this.providerMessage = providerMessage;
  }
}

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

export function normalizeEpayEndpointUrl(value: string, endpoint: "submit" | "mapi" | "api") {
  const url = new URL(normalizeEpayGatewayUrl(value));
  const file = endpoint === "mapi" ? "mapi.php" : endpoint === "api" ? "api.php" : "submit.php";
  url.pathname = url.pathname.replace(/(?:submit|mapi|api)\.php$/i, file);
  if (!/(?:submit|mapi|api)\.php$/i.test(url.pathname)) url.pathname = `${url.pathname.replace(/\/$/, "")}/${file}`;
  return url.toString();
}

export function detectEpayDevice(userAgent: string | null | undefined): EpayDevice {
  const value = userAgent?.toLowerCase() ?? "";
  if (/alipayclient/.test(value)) return "alipay";
  if (/micromessenger/.test(value)) return "wechat";
  if (/(?:^|[\s;])qq\//.test(value)) return "qq";
  if (/android|iphone|ipad|ipod|mobile|windows phone/.test(value)) return "mobile";
  return "pc";
}

function utf8Limit(value: string, maxBytes: number) {
  let result = "";
  let bytes = 0;
  for (const character of value) {
    const size = Buffer.byteLength(character, "utf8");
    if (bytes + size > maxBytes) break;
    result += character;
    bytes += size;
  }
  return result;
}

function safeProviderMessage(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
}

function safePaymentTarget(value: unknown, kind: "payurl" | "qrcode" | "urlscheme") {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > 4096 || /[\u0000-\u001f\u007f]/.test(normalized)) return null;
  if (kind === "qrcode") return normalized;
  try {
    const url = new URL(normalized);
    if (url.username || url.password) return null;
    if (kind === "payurl") return ["http:", "https:"].includes(url.protocol) ? normalized : null;
    return ["weixin:", "alipays:", "alipay:", "mqqapi:"].includes(url.protocol) ? normalized : null;
  } catch {
    return null;
  }
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
    name: utf8Limit(input.subject, 127),
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
  device?: EpayDevice;
}) {
  const params: Record<string, string> = {
    pid: input.merchantPid,
    type: input.paymentType,
    out_trade_no: input.orderNo,
    notify_url: input.notifyUrl,
    return_url: input.returnUrl,
    name: utf8Limit(input.subject, 127),
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
    name: utf8Limit(input.subject, 127),
    money: input.amount,
  };
  return { ...params, sign: signEpayParams(params, input.merchantKey), sign_type: "MD5" };
}

export function parseEpayApiPaymentResult(value: unknown, options: { strictSingleTarget?: boolean } = {}): EpayApiPaymentResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("EPAY_API_INVALID_RESPONSE");
  const result = value as Record<string, unknown>;
  if (String(result.code ?? "") !== "1") throw new EpayProtocolError("EPAY_API_ORDER_FAILED", safeProviderMessage(result.msg));
  const rawTargets = [result.payurl, result.qrcode, result.urlscheme].filter((item) => typeof item === "string" && item.trim());
  if (options.strictSingleTarget && rawTargets.length !== 1) throw new Error("EPAY_API_TARGET_COUNT_INVALID");
  const paymentUrl = safePaymentTarget(result.payurl, "payurl");
  const paymentQrCode = safePaymentTarget(result.qrcode, "qrcode");
  const paymentScheme = safePaymentTarget(result.urlscheme, "urlscheme");
  if ((result.payurl && !paymentUrl) || (result.urlscheme && !paymentScheme)) throw new Error("EPAY_API_INVALID_PAYMENT_URL");
  if (![paymentUrl, paymentQrCode, paymentScheme].filter(Boolean).length) throw new Error("EPAY_API_NO_PAYMENT_TARGET");
  return { paymentUrl, paymentQrCode, paymentScheme };
}
