import assert from "node:assert/strict";
import {
  canonicalEpayParams,
  createEpayApiParams,
  createEpayRedirectParams,
  createEpayUrl,
  detectEpayDevice,
  EpayProtocolError,
  normalizeEpayEndpointUrl,
  normalizeEpayGatewayUrl,
  parseEpayApiPaymentResult,
  signEpayParams,
  verifyEpaySignature,
} from "../src/lib/epay.ts";
import { epayProtocolProfileForGateway, isEpayPaymentTypeSupported } from "../src/lib/payment-options.ts";

const callback = { trade_status: "TRADE_SUCCESS", money: "12.30", pid: "1001", out_trade_no: "STAR123", trade_no: "EPAY456", sign_type: "MD5", sign: "" };
assert.equal(canonicalEpayParams(callback), "money=12.30&out_trade_no=STAR123&pid=1001&trade_no=EPAY456&trade_status=TRADE_SUCCESS");
const signature = signEpayParams(callback, "merchant-secret");
assert.match(signature, /^[a-f0-9]{32}$/);
assert.equal(verifyEpaySignature({ ...callback, sign: signature }, "merchant-secret"), true);
assert.equal(verifyEpaySignature({ ...callback, money: "12.31", sign: signature }, "merchant-secret"), false);
assert.equal(verifyEpaySignature({ ...callback, sign: "invalid" }, "merchant-secret"), false);

assert.equal(normalizeEpayGatewayUrl("https://pay.example.com"), "https://pay.example.com/submit.php");
assert.equal(normalizeEpayGatewayUrl("https://pay.example.com/gateway/"), "https://pay.example.com/gateway/submit.php");
assert.equal(normalizeEpayEndpointUrl("https://pay.example.com/gateway/submit.php", "mapi"), "https://pay.example.com/gateway/mapi.php");
assert.equal(normalizeEpayEndpointUrl("https://pay.example.com/gateway/mapi.php", "api"), "https://pay.example.com/gateway/api.php");
assert.equal(normalizeEpayEndpointUrl("https://pay.example.com/gateway/api.php", "submit"), "https://pay.example.com/gateway/submit.php");
assert.throws(() => normalizeEpayGatewayUrl("https://user:pass@pay.example.com"), /INVALID_EPAY_GATEWAY/);

assert.equal(detectEpayDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"), "pc");
assert.equal(detectEpayDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile"), "mobile");
assert.equal(detectEpayDevice("Mozilla/5.0 MicroMessenger/8.0.50 Mobile"), "wechat");
assert.equal(detectEpayDevice("Mozilla/5.0 AlipayClient/10.6.0 Mobile"), "alipay");
assert.equal(detectEpayDevice("Mozilla/5.0 (Linux; Android 15) QQ/9.1.20 Mobile"), "qq");

const commonInput = {
  merchantPid: "1001",
  merchantKey: "merchant-secret",
  paymentType: "alipay",
  notifyUrl: "https://api.example.com/api/v1/payments/epay/notify/provider",
  returnUrl: "https://api.example.com/console/billing?payment=returned",
  orderNo: "STAR123",
  amount: "12.30",
  subject: `${"星".repeat(42)}a very long suffix`,
};
const redirectParams = createEpayRedirectParams(commonInput);
assert.equal(Buffer.byteLength(redirectParams.name, "utf8"), 127);
assert.equal(verifyEpaySignature(redirectParams, "merchant-secret"), true);
const apiParams = createEpayApiParams({ ...commonInput, clientIp: "203.0.113.10", device: "wechat" });
assert.equal(apiParams.clientip, "203.0.113.10");
assert.equal(apiParams.device, "wechat");
assert.equal(verifyEpaySignature(apiParams, "merchant-secret"), true);

const paymentUrl = new URL(createEpayUrl({ ...commonInput, subject: "Star API recharge", gatewayUrl: "https://pay.example.com" }));
assert.equal(paymentUrl.pathname, "/submit.php");
assert.equal(paymentUrl.searchParams.get("pid"), "1001");
assert.equal(paymentUrl.searchParams.get("type"), "alipay");
assert.equal(paymentUrl.searchParams.get("sign_type"), "MD5");
assert.equal(verifyEpaySignature(Object.fromEntries(paymentUrl.searchParams), "merchant-secret"), true);

assert.deepEqual(parseEpayApiPaymentResult({ code: 1, payurl: "https://pay.example.com/order/1" }, { strictSingleTarget: true }), { paymentUrl: "https://pay.example.com/order/1", paymentQrCode: null, paymentScheme: null });
assert.deepEqual(parseEpayApiPaymentResult({ code: 1, qrcode: "https://pay.example.com/qr/1" }, { strictSingleTarget: true }), { paymentUrl: null, paymentQrCode: "https://pay.example.com/qr/1", paymentScheme: null });
assert.deepEqual(parseEpayApiPaymentResult({ code: 1, urlscheme: "weixin://pay/order/1" }, { strictSingleTarget: true }), { paymentUrl: null, paymentQrCode: null, paymentScheme: "weixin://pay/order/1" });
assert.throws(() => parseEpayApiPaymentResult({ code: 1, payurl: "https://pay.example.com/1", qrcode: "https://pay.example.com/qr/1" }, { strictSingleTarget: true }), /EPAY_API_TARGET_COUNT_INVALID/);
assert.throws(() => parseEpayApiPaymentResult({ code: 1, payurl: "javascript:alert(1)" }), /EPAY_API_INVALID_PAYMENT_URL/);
assert.throws(() => parseEpayApiPaymentResult({ code: 1, urlscheme: "https://pay.example.com/not-a-scheme" }), /EPAY_API_INVALID_PAYMENT_URL/);
assert.throws(() => parseEpayApiPaymentResult({ code: 1, payurl: "https://user:pass@pay.example.com/1" }), /EPAY_API_INVALID_PAYMENT_URL/);
assert.throws(
  () => parseEpayApiPaymentResult({ code: 0, msg: "  merchant\n rejected\u0000  " }),
  (error) => error instanceof EpayProtocolError && error.message === "EPAY_API_ORDER_FAILED" && error.providerMessage === "merchant rejected",
);

assert.equal(epayProtocolProfileForGateway("https://pay.id0.cn/submit.php"), "ID0_STANDARD");
assert.equal(epayProtocolProfileForGateway("https://gateway.example.com/submit.php"), "GENERIC_EPAY");
assert.equal(isEpayPaymentTypeSupported("ID0_STANDARD", "alipay"), true);
assert.equal(isEpayPaymentTypeSupported("ID0_STANDARD", "wxpay"), true);
assert.equal(isEpayPaymentTypeSupported("ID0_STANDARD", "qqpay"), false);
assert.equal(isEpayPaymentTypeSupported("GENERIC_EPAY", "qqpay"), true);

console.log("Validated EPay signing, endpoint normalization, device detection, API targets, and pay.id0.cn protocol constraints.");
