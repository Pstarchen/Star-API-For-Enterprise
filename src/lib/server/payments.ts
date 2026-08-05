import "server-only";

import { createDecipheriv, createSign, createVerify, randomBytes, sign } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/prisma";

export function paymentOrderNo() {
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  return `STAR${stamp}${randomBytes(5).toString("hex").toUpperCase()}`;
}

function pem(value: string, type: "PRIVATE" | "PUBLIC") {
  if (value.includes("-----BEGIN")) return value.replaceAll("\\n", "\n");
  const lines = value.replace(/\s/g, "").match(/.{1,64}/g)?.join("\n") ?? value;
  return `-----BEGIN ${type} KEY-----\n${lines}\n-----END ${type} KEY-----`;
}

function canonical(params: Record<string, string>) {
  return Object.entries(params).filter(([, value]) => value !== "").sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join("&");
}

export function createAlipayUrl(input: { gatewayUrl: string; appId: string; privateKey: string; notifyUrl: string; returnUrl: string; orderNo: string; amount: string; subject: string }) {
  const params: Record<string, string> = { app_id: input.appId, method: "alipay.trade.page.pay", format: "JSON", charset: "utf-8", sign_type: "RSA2", timestamp: new Date().toLocaleString("sv-SE", { timeZone: "Asia/Shanghai" }), version: "1.0", notify_url: input.notifyUrl, return_url: input.returnUrl, biz_content: JSON.stringify({ out_trade_no: input.orderNo, total_amount: input.amount, subject: input.subject, product_code: "FAST_INSTANT_TRADE_PAY" }) };
  const signer = createSign("RSA-SHA256"); signer.update(canonical(params), "utf8"); signer.end();
  const url = new URL(input.gatewayUrl); Object.entries({ ...params, sign: signer.sign(pem(input.privateKey, "PRIVATE"), "base64") }).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.toString();
}

export function verifyAlipayNotification(params: Record<string, string>, publicKey: string) {
  const signature = params.sign; if (!signature) return false;
  const data = { ...params }; delete data.sign; delete data.sign_type;
  const verifier = createVerify("RSA-SHA256"); verifier.update(canonical(data), "utf8"); verifier.end();
  return verifier.verify(pem(publicKey, "PUBLIC"), signature, "base64");
}

export async function createWechatNative(input: { appId: string; merchantId: string; serialNo: string; privateKey: string; notifyUrl: string; orderNo: string; amountFen: number; description: string }) {
  const path = "/v3/pay/transactions/native";
  const body = JSON.stringify({ appid: input.appId, mchid: input.merchantId, description: input.description, out_trade_no: input.orderNo, notify_url: input.notifyUrl, amount: { total: input.amountFen, currency: "CNY" } });
  const timestamp = Math.floor(Date.now() / 1000).toString(); const nonce = randomBytes(16).toString("hex");
  const message = `POST\n${path}\n${timestamp}\n${nonce}\n${body}\n`;
  const signature = sign("RSA-SHA256", Buffer.from(message), pem(input.privateKey, "PRIVATE")).toString("base64");
  const authorization = `WECHATPAY2-SHA256-RSA2048 mchid="${input.merchantId}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${input.serialNo}",signature="${signature}"`;
  const response = await fetch(`https://api.mch.weixin.qq.com${path}`, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: authorization, "User-Agent": "Star-API" }, body, cache: "no-store" });
  const result = await response.json().catch(() => ({})) as { code_url?: string; message?: string };
  if (!response.ok || !result.code_url) throw new Error(result.message || "WECHAT_ORDER_FAILED");
  return result.code_url;
}

export function verifyWechatSignature(input: { timestamp: string; nonce: string; body: string; signature: string; publicKey: string }) {
  const verifier = createVerify("RSA-SHA256"); verifier.update(`${input.timestamp}\n${input.nonce}\n${input.body}\n`); verifier.end();
  return verifier.verify(pem(input.publicKey, "PUBLIC"), input.signature, "base64");
}

export function decryptWechatResource(resource: { ciphertext: string; nonce: string; associated_data?: string }, apiV3Key: string) {
  const encrypted = Buffer.from(resource.ciphertext, "base64"); const tag = encrypted.subarray(encrypted.length - 16); const data = encrypted.subarray(0, encrypted.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(apiV3Key, "utf8"), Buffer.from(resource.nonce)); decipher.setAuthTag(tag); if (resource.associated_data) decipher.setAAD(Buffer.from(resource.associated_data));
  return JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8")) as { out_trade_no: string; transaction_id: string; trade_state: string; amount: { total: number } };
}

export async function completePayment(
  orderNo: string,
  externalTradeNo: string,
  amount: Prisma.Decimal,
  context: { actorId?: string; ipAddress?: string | null; note?: string } = {},
) {
  return prisma.$transaction(async (transaction) => {
    const order = await transaction.paymentOrder.findUnique({ where: { orderNo }, include: { invoice: true } });
    if (!order || !order.invoice || order.amount.comparedTo(amount) !== 0) throw new Error("PAYMENT_MISMATCH");
    if (order.status === "PAID") return order;
    if (order.status !== "PENDING" || order.invoice.status !== "ISSUED") throw new Error("PAYMENT_NOT_PAYABLE");
    const updated = await transaction.paymentOrder.update({ where: { id: order.id }, data: { status: "PAID", externalTradeNo, paidAt: new Date() } });
    await transaction.invoice.update({ where: { id: order.invoice.id }, data: { status: "PAID" } });
    await transaction.auditLog.create({ data: { tenantId: order.tenantId, actorId: context.actorId, action: "payment.completed", resource: "payment-order", resourceId: order.id, metadata: { orderNo, channel: order.channel, externalTradeNo, ...(context.note ? { note: context.note } : {}) }, ipAddress: context.ipAddress } });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
