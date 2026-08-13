import assert from "node:assert/strict";
import { canonicalEpayParams, createEpayUrl, normalizeEpayGatewayUrl, signEpayParams, verifyEpaySignature } from "../src/lib/epay.ts";

const callback = { trade_status: "TRADE_SUCCESS", money: "12.30", pid: "1001", out_trade_no: "STAR123", trade_no: "EPAY456", sign_type: "MD5", sign: "" };
assert.equal(canonicalEpayParams(callback), "money=12.30&out_trade_no=STAR123&pid=1001&trade_no=EPAY456&trade_status=TRADE_SUCCESS");
const signature = signEpayParams(callback, "merchant-secret");
assert.match(signature, /^[a-f0-9]{32}$/);
assert.equal(verifyEpaySignature({ ...callback, sign: signature }, "merchant-secret"), true);
assert.equal(verifyEpaySignature({ ...callback, money: "12.31", sign: signature }, "merchant-secret"), false);
assert.equal(verifyEpaySignature({ ...callback, sign: "invalid" }, "merchant-secret"), false);
assert.equal(normalizeEpayGatewayUrl("https://pay.example.com"), "https://pay.example.com/submit.php");
assert.equal(normalizeEpayGatewayUrl("https://pay.example.com/gateway/"), "https://pay.example.com/gateway/submit.php");
assert.throws(() => normalizeEpayGatewayUrl("https://user:pass@pay.example.com"), /INVALID_EPAY_GATEWAY/);

const paymentUrl = new URL(createEpayUrl({ gatewayUrl: "https://pay.example.com", merchantPid: "1001", merchantKey: "merchant-secret", paymentType: "alipay", notifyUrl: "https://api.example.com/api/v1/payments/epay/notify/provider", returnUrl: "https://api.example.com/console/billing?payment=returned", orderNo: "STAR123", amount: "12.30", subject: "Star API recharge" }));
assert.equal(paymentUrl.pathname, "/submit.php");
assert.equal(paymentUrl.searchParams.get("pid"), "1001");
assert.equal(paymentUrl.searchParams.get("type"), "alipay");
assert.equal(paymentUrl.searchParams.get("sign_type"), "MD5");
assert.equal(verifyEpaySignature(Object.fromEntries(paymentUrl.searchParams), "merchant-secret"), true);
console.log("Validated EPay canonicalization, signing, verification, and submit URLs.");
