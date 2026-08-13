import { randomBytes, scrypt as nodeScrypt } from "node:crypto";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { Prisma, PrismaClient } from "@prisma/client";
import { signEpayParams, verifyEpaySignature } from "../src/lib/epay.ts";

if (!process.env.DATABASE_URL) {
  const secretsDir = process.env.STAR_API_SECRETS_DIR ?? "/run/star-api-secrets";
  const password = readFileSync(`${secretsDir}/POSTGRES_PASSWORD`, "utf8").trim();
  const host = process.env.POSTGRES_HOST ?? "postgres";
  const database = process.env.POSTGRES_DB ?? "starapi";
  process.env.DATABASE_URL = `postgresql://starapi:${encodeURIComponent(password)}@${host}:5432/${database}?schema=public`;
}

const prisma = new PrismaClient();
const scrypt = promisify(nodeScrypt);
const baseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:18183";
const marker = `epay-e2e-${Date.now()}-${randomBytes(3).toString("hex")}`;
const password = `Epay-${randomBytes(10).toString("hex")}9`;
const merchantKey = `merchant-${randomBytes(24).toString("hex")}`;
const merchantPid = `pid-${randomBytes(6).toString("hex")}`;
const cookies = { admin: "", user: "" };
let adminId = "";
let userId = "";
let adminTenantId = "";
let userTenantId = "";
let providerId = "";
let disposableProviderId = "";
let invoiceId = "";
let platformCreated = false;
let previousPlatformValue = null;

function assert(condition, message) { if (!condition) throw new Error(message); }
async function hashPassword(value) { const salt = randomBytes(16); const key = await scrypt(value, salt, 64); return `scrypt-v1$${salt.toString("base64url")}$${Buffer.from(key).toString("base64url")}`; }

async function api(path, options = {}, jar) {
  const headers = { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(jar && cookies[jar] ? { Cookie: cookies[jar] } : {}), ...options.headers };
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers, redirect: "manual" });
  if (jar) {
    const values = response.headers.getSetCookie?.() ?? [];
    if (values.length) cookies[jar] = values.map((item) => item.split(";")[0]).join("; ");
  }
  const text = await response.text();
  let body = text;
  try { body = text ? JSON.parse(text) : null; } catch {}
  return { response, body, text };
}

function callbackValues(orderNo, overrides = {}) {
  const values = {
    pid: merchantPid,
    type: "alipay",
    out_trade_no: orderNo,
    trade_no: `${marker}-trade`,
    trade_status: "TRADE_SUCCESS",
    money: "12.30",
    ...overrides,
  };
  return { ...values, sign: signEpayParams(values, merchantKey), sign_type: "MD5" };
}

async function callback(provider, values, method = "POST") {
  if (method === "GET") return api(`/api/v1/payments/epay/notify/${provider}?${new URLSearchParams(values)}`);
  return api(`/api/v1/payments/epay/notify/${provider}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(values) });
}

async function assertPending(orderNo, message) {
  const [order, tenant, entries] = await Promise.all([
    prisma.paymentOrder.findUnique({ where: { orderNo } }),
    prisma.tenant.findUnique({ where: { id: userTenantId } }),
    prisma.walletEntry.count({ where: { tenantId: userTenantId } }),
  ]);
  assert(order?.status === "PENDING" && tenant?.balance.eq(0) && entries === 0, message);
}

async function cleanup() {
  if (userTenantId) {
    await prisma.emailDelivery.deleteMany({ where: { tenantId: userTenantId } }).catch(() => undefined);
    await prisma.walletEntry.deleteMany({ where: { tenantId: userTenantId } }).catch(() => undefined);
    await prisma.paymentOrder.deleteMany({ where: { tenantId: userTenantId } }).catch(() => undefined);
    await prisma.invoice.deleteMany({ where: { tenantId: userTenantId } }).catch(() => undefined);
  }
  if (providerId) await prisma.paymentProvider.deleteMany({ where: { id: providerId } }).catch(() => undefined);
  if (disposableProviderId) await prisma.paymentProvider.deleteMany({ where: { id: disposableProviderId } }).catch(() => undefined);
  if (adminId || userId || adminTenantId || userTenantId) await prisma.auditLog.deleteMany({ where: { OR: [{ actorId: { in: [adminId, userId].filter(Boolean) } }, { tenantId: { in: [adminTenantId, userTenantId].filter(Boolean) } }] } }).catch(() => undefined);
  if (adminId || userId) await prisma.user.deleteMany({ where: { id: { in: [adminId, userId].filter(Boolean) } } }).catch(() => undefined);
  if (adminTenantId || userTenantId) await prisma.tenant.deleteMany({ where: { id: { in: [adminTenantId, userTenantId].filter(Boolean) } } }).catch(() => undefined);
  if (platformCreated) await prisma.platformSetting.deleteMany({ where: { key: "platform" } }).catch(() => undefined);
  else if (previousPlatformValue !== null) await prisma.platformSetting.update({ where: { key: "platform" }, data: { value: previousPlatformValue } }).catch(() => undefined);
  await prisma.$disconnect();
}

try {
  const platformValue = { name: "Star-API EPay E2E", description: "EPay E2E", publicUrl: baseUrl, icpNumber: "", publicSecurityNumber: "", hasCustomIcon: false, hasCustomHero: false };
  const existingPlatform = await prisma.platformSetting.findUnique({ where: { key: "platform" } });
  if (existingPlatform) {
    previousPlatformValue = existingPlatform.value;
    await prisma.platformSetting.update({ where: { key: "platform" }, data: { value: platformValue } });
  } else {
    await prisma.platformSetting.create({ data: { key: "platform", value: platformValue } });
    platformCreated = true;
  }
  const hash = await hashPassword(password);
  const [adminTenant, userTenant] = await Promise.all([
    prisma.tenant.create({ data: { name: `${marker}-admin`, type: "PERSONAL", status: "ACTIVE" } }),
    prisma.tenant.create({ data: { name: `${marker}-user`, type: "PERSONAL", status: "ACTIVE" } }),
  ]);
  adminTenantId = adminTenant.id; userTenantId = userTenant.id;
  const [admin, user] = await Promise.all([
    prisma.user.create({ data: { name: "EPay E2E Admin", email: `${marker}-admin@example.test`, passwordHash: hash, emailVerifiedAt: new Date(), platformRole: "ADMIN", memberships: { create: { tenantId: adminTenant.id, role: "OWNER" } } } }),
    prisma.user.create({ data: { name: "EPay E2E User", email: `${marker}-user@example.test`, passwordHash: hash, emailVerifiedAt: new Date(), memberships: { create: { tenantId: userTenant.id, role: "OWNER" } } } }),
  ]);
  adminId = admin.id; userId = user.id;

  let result = await api("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ email: admin.email, password, remember: false }) }, "admin");
  assert(result.response.status === 200 && cookies.admin.includes("star_api_session="), `admin login failed: ${result.response.status} ${result.text}`);
  result = await api("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ email: user.email, password, remember: false }) }, "user");
  assert(result.response.status === 200 && cookies.user.includes("star_api_session="), `user login failed: ${result.response.status} ${result.text}`);

  result = await api("/api/v1/admin/payment-providers", {}, "user");
  assert(result.response.status === 403, `non-admin provider access should be forbidden: ${result.response.status}`);
  result = await api("/api/v1/admin/payment-providers", { method: "POST", body: JSON.stringify({ name: "Unsafe", gatewayUrl: "http://127.0.0.1/", merchantPid, merchantKey, paymentTypes: ["alipay"], feeRate: "0", minAmount: "1.00", maxAmount: "100.00", sortOrder: 0, enabled: true }) }, "admin");
  assert(result.response.status === 400, `private payment gateway should be rejected: ${result.response.status} ${result.text}`);
  result = await api("/api/v1/admin/payment-providers", { method: "POST", body: JSON.stringify({ name: "Forged profile", gatewayUrl: "https://example.com/pay/", merchantPid, merchantKey, paymentTypes: ["alipay"], protocolProfile: "ID0_STANDARD", feeRate: "0", minAmount: "1.00", maxAmount: "100.00", sortOrder: 0, enabled: false }) }, "admin");
  assert(result.response.status === 400, `client-selected protocol profile should be rejected: ${result.response.status} ${result.text}`);
  result = await api("/api/v1/admin/payment-providers", { method: "POST", body: JSON.stringify({ name: "Invalid ID0 method", gatewayUrl: "https://pay.id0.cn/", merchantPid, merchantKey, paymentTypes: ["qqpay"], feeRate: "0", minAmount: "1.00", maxAmount: "100.00", sortOrder: 0, enabled: false }) }, "admin");
  assert(result.response.status === 400, `pay.id0.cn QQ payment should be rejected: ${result.response.status} ${result.text}`);

  const createPayload = { name: "E2E 易支付", gatewayUrl: "https://example.com/pay/", merchantPid, merchantKey, paymentTypes: ["alipay", "wxpay"], feeRate: "1.2500", minAmount: "1.00", maxAmount: "500.00", sortOrder: 10, enabled: true, description: "EPay lifecycle E2E" };
  result = await api("/api/v1/admin/payment-providers", { method: "POST", body: JSON.stringify(createPayload) }, "admin");
  assert(result.response.status === 201, `provider create failed: ${result.response.status} ${result.text}`);
  assert(!result.text.includes(merchantKey) && !Object.hasOwn(result.body.data, "merchantKey"), "provider response leaked merchant key");
  providerId = result.body.data.id;

  result = await api("/api/v1/admin/payment-providers", {}, "admin");
  assert(result.response.status === 200 && result.body.data.some((item) => item.id === providerId) && !result.text.includes(merchantKey), "provider list failed or leaked merchant key");
  result = await api("/api/v1/admin/payment-providers", { method: "PATCH", body: JSON.stringify({ id: providerId, ...createPayload, merchantKey: undefined, name: "E2E 易支付（已编辑）", sortOrder: 5 }) }, "admin");
  assert(result.response.status === 200 && result.body.data.merchantKeyConfigured === true, `blank-secret edit failed: ${result.response.status} ${result.text}`);

  result = await api("/api/v1/payments", { method: "POST", body: JSON.stringify({ orderType: "RECHARGE", amount: "12.30", channel: "EPAY", paymentProviderId: providerId, paymentType: "qqpay" }) }, "user");
  assert(result.response.status === 400, `unsupported payment type should fail: ${result.response.status} ${result.text}`);
  result = await api("/api/v1/payments", { method: "POST", body: JSON.stringify({ orderType: "RECHARGE", amount: "0.50", channel: "EPAY", paymentProviderId: providerId, paymentType: "alipay" }) }, "user");
  assert(result.response.status === 400, `below-minimum amount should fail: ${result.response.status} ${result.text}`);

  result = await api("/api/v1/payments", { method: "POST", body: JSON.stringify({ orderType: "RECHARGE", amount: "12.30", channel: "EPAY", paymentProviderId: providerId, paymentType: "alipay" }) }, "user");
  assert(result.response.status === 201 && result.body.data.channel === "EPAY", `EPay recharge order failed: ${result.response.status} ${result.text}`);
  const rechargeOrderNo = result.body.data.orderNo;
  const paymentUrl = new URL(result.body.data.paymentUrl);
  assert(paymentUrl.origin === "https://example.com" && paymentUrl.pathname === "/pay/submit.php", "EPay gateway URL was not normalized");
  assert(paymentUrl.searchParams.get("pid") === merchantPid && paymentUrl.searchParams.get("type") === "alipay" && paymentUrl.searchParams.get("money") === "12.30" && paymentUrl.searchParams.get("out_trade_no") === rechargeOrderNo, "EPay submit URL fields are incorrect");
  assert(paymentUrl.searchParams.get("notify_url") === `${baseUrl}/api/v1/payments/epay/notify/${providerId}` && paymentUrl.searchParams.get("return_url") === `${baseUrl}/console/billing?payment=returned`, "EPay callback URLs are incorrect");
  assert(verifyEpaySignature(Object.fromEntries(paymentUrl.searchParams), merchantKey), "EPay submit signature is invalid after blank-secret edit");
  result = await api("/api/v1/admin/payment-providers", { method: "PATCH", body: JSON.stringify({ id: providerId, ...createPayload, merchantPid: `${merchantPid}-changed`, merchantKey: undefined }) }, "admin");
  assert(result.response.status === 409, `PID change with pending order should be locked: ${result.response.status} ${result.text}`);
  result = await api("/api/v1/admin/payment-providers", { method: "PATCH", body: JSON.stringify({ id: providerId, ...createPayload, merchantKey: `${merchantKey}-changed` }) }, "admin");
  assert(result.response.status === 409, `key change with pending order should be locked: ${result.response.status} ${result.text}`);

  let values = callbackValues(rechargeOrderNo);
  result = await callback(providerId, { ...values, sign: "0".repeat(32) });
  assert(result.response.status === 400 && result.text === "fail", "invalid signature callback should fail");
  await assertPending(rechargeOrderNo, "invalid signature changed payment state");
  result = await callback(providerId, callbackValues(rechargeOrderNo, { pid: "wrong-pid" }));
  assert(result.response.status === 400, "wrong PID callback should fail");
  await assertPending(rechargeOrderNo, "wrong PID changed payment state");
  result = await callback(providerId, callbackValues(rechargeOrderNo, { money: "12.31" }));
  assert(result.response.status === 409, "wrong amount callback should fail");
  await assertPending(rechargeOrderNo, "wrong amount changed payment state");
  result = await callback(providerId, callbackValues(rechargeOrderNo, { type: "wxpay" }));
  assert(result.response.status === 409, "wrong payment type callback should fail");
  await assertPending(rechargeOrderNo, "wrong payment type changed payment state");
  result = await callback("missing-provider", values);
  assert(result.response.status === 404, "wrong provider callback should fail");
  await assertPending(rechargeOrderNo, "wrong provider changed payment state");
  result = await callback(providerId, callbackValues(rechargeOrderNo, { trade_status: "TRADE_CLOSED" }));
  assert(result.response.status === 400, "unsuccessful trade callback should fail");
  await assertPending(rechargeOrderNo, "unsuccessful trade changed payment state");

  result = await callback(providerId, values, "POST");
  assert(result.response.status === 200 && result.text === "success", `valid POST callback failed: ${result.response.status} ${result.text}`);
  let [paidOrder, paidTenant, ledger] = await Promise.all([
    prisma.paymentOrder.findUnique({ where: { orderNo: rechargeOrderNo } }),
    prisma.tenant.findUnique({ where: { id: userTenantId } }),
    prisma.walletEntry.findMany({ where: { tenantId: userTenantId, paymentOrder: { orderNo: rechargeOrderNo } } }),
  ]);
  assert(paidOrder?.status === "PAID" && paidOrder.externalTradeNo === values.trade_no && paidTenant?.balance.eq("12.30") && ledger.length === 1 && ledger[0].delta.eq("12.30"), "valid callback did not atomically credit wallet");

  result = await callback(providerId, values, "GET");
  assert(result.response.status === 200 && result.text === "success", "duplicate GET callback should return success");
  [paidTenant, ledger] = await Promise.all([prisma.tenant.findUnique({ where: { id: userTenantId } }), prisma.walletEntry.findMany({ where: { tenantId: userTenantId, paymentOrder: { orderNo: rechargeOrderNo } } })]);
  assert(paidTenant?.balance.eq("12.30") && ledger.length === 1, "duplicate callback credited wallet more than once");
  result = await callback(providerId, callbackValues(rechargeOrderNo, { trade_no: `${marker}-different-trade` }), "GET");
  assert(result.response.status === 409 && result.text === "fail", "same order with different trade number should be rejected");

  const invoice = await prisma.invoice.create({ data: { tenantId: userTenantId, period: `${marker}-invoice`, amount: new Prisma.Decimal("8.80"), status: "ISSUED", issuedAt: new Date() } });
  invoiceId = invoice.id;
  result = await api("/api/v1/payments", { method: "POST", body: JSON.stringify({ orderType: "INVOICE", invoiceId, channel: "EPAY", paymentProviderId: providerId, paymentType: "wxpay" }) }, "user");
  assert(result.response.status === 201, `EPay invoice order failed: ${result.response.status} ${result.text}`);
  const invoiceOrderNo = result.body.data.orderNo;
  const invoiceCallback = callbackValues(invoiceOrderNo, { type: "wxpay", money: "8.80", trade_no: `${marker}-invoice-trade` });
  result = await callback(providerId, invoiceCallback, "GET");
  assert(result.response.status === 200, `invoice callback failed: ${result.response.status} ${result.text}`);
  const paidInvoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  assert(paidInvoice?.status === "PAID", "EPay callback did not pay invoice");

  result = await api("/api/v1/admin/payment-providers", { method: "DELETE", body: JSON.stringify({ id: providerId }) }, "admin");
  assert(result.response.status === 409, "provider with historical orders should not be deleted");
  result = await api("/api/v1/payments", { method: "POST", body: JSON.stringify({ orderType: "RECHARGE", amount: "5.00", channel: "EPAY", paymentProviderId: providerId, paymentType: "alipay" }) }, "user");
  assert(result.response.status === 201, `expired-order setup failed: ${result.response.status} ${result.text}`);
  const expiredOrderNo = result.body.data.orderNo;
  const encryptedKey = await prisma.paymentProvider.findUnique({ where: { id: providerId }, select: { merchantKeyEncrypted: true } });
  await prisma.paymentProvider.update({ where: { id: providerId }, data: { merchantKeyEncrypted: Buffer.from("invalid-encrypted-key") } });
  result = await callback(providerId, callbackValues(expiredOrderNo, { money: "5.00", trade_no: `${marker}-corrupt-key` }));
  assert(result.response.status === 409 && result.text === "fail", "corrupt provider key callback should fail without a server error");
  const orderAfterCorruptKey = await prisma.paymentOrder.findUnique({ where: { orderNo: expiredOrderNo } });
  assert(orderAfterCorruptKey?.status === "PENDING", "corrupt provider key callback changed payment state");
  await prisma.paymentProvider.update({ where: { id: providerId }, data: { merchantKeyEncrypted: encryptedKey.merchantKeyEncrypted } });
  await prisma.paymentOrder.update({ where: { orderNo: expiredOrderNo }, data: { expiresAt: new Date(Date.now() - 1000) } });
  result = await api("/api/v1/admin/payment-providers", { method: "PATCH", body: JSON.stringify({ id: providerId, ...createPayload, merchantPid: `${merchantPid}-rotated`, merchantKey: undefined, name: "E2E 易支付（已停用）", enabled: false }) }, "admin");
  assert(result.response.status === 200 && result.body.data.enabled === false, "provider disable failed");
  const expiredOrder = await prisma.paymentOrder.findUnique({ where: { orderNo: expiredOrderNo } });
  assert(expiredOrder?.status === "EXPIRED", "expired pending order was not released before provider credential rotation");
  result = await api("/api/v1/payments", { method: "POST", body: JSON.stringify({ orderType: "RECHARGE", amount: "5.00", channel: "EPAY", paymentProviderId: providerId, paymentType: "alipay" }) }, "user");
  assert(result.response.status === 409, "disabled provider should reject new orders");

  result = await api("/api/v1/admin/payment-providers", { method: "POST", body: JSON.stringify({ ...createPayload, name: "E2E 可删除服务商", merchantPid: `${merchantPid}-disposable`, merchantKey: `${merchantKey}-disposable`, enabled: false }) }, "admin");
  assert(result.response.status === 201, `disposable provider create failed: ${result.response.status} ${result.text}`);
  disposableProviderId = result.body.data.id;
  result = await api("/api/v1/admin/payment-providers", { method: "DELETE", body: JSON.stringify({ id: disposableProviderId }) }, "admin");
  assert(result.response.status === 200, `provider without orders should be deleted: ${result.response.status} ${result.text}`);
  disposableProviderId = "";

  console.log("Validated EPay provider management, signed orders, strict callbacks, idempotent wallet credit, invoice payment, and audit retention.");
} finally {
  await cleanup();
}
