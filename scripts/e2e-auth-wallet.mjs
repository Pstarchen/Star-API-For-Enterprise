import { createHash, randomBytes, scrypt as nodeScrypt } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { promisify } from "node:util";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const scrypt = promisify(nodeScrypt);
const baseUrl = process.env.E2E_BASE_URL ?? "http://app:3000";
const smtpFile = process.env.E2E_SMTP_FILE ?? "./backups/messages.eml";
const marker = `e2e-${Date.now()}-${randomBytes(3).toString("hex")}`;
const adminEmail = `${marker}-admin@example.com`;
const userEmail = `${marker}-user@example.com`;
const notificationEmail = `${marker}-notice@example.com`;
const password = `Test-${randomBytes(10).toString("hex")}9`;
const nextPassword = `Reset-${randomBytes(10).toString("hex")}8`;
const cookieJars = { admin: "", user: "", reset: "" };
let originalPolicy = null;
let originalEmailSettings = null;
const originalIntegrations = new Map();
const createdUserIds = [];
const createdTenantIds = [];
const createdProductIds = [];
const createdProviderIds = [];
const createdCategoryIds = [];

function assert(condition, message) { if (!condition) throw new Error(message); }
async function passwordHash(value) { const salt = randomBytes(16); const key = await scrypt(value, salt, 64); return `scrypt-v1$${salt.toString("base64url")}$${Buffer.from(key).toString("base64url")}`; }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function smtpMessages() { return existsSync(smtpFile) ? readFileSync(smtpFile, "utf8").split("---MESSAGE-END---").filter((message) => message.trim()) : []; }
function decodeQuotedPrintable(value) {
  return value.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
}
async function waitForMessage(recipient, since = 0, timeoutMs = 12000, matches = () => true) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const messages = smtpMessages();
    const found = messages.slice(since).map(decodeQuotedPrintable).find((message) => message.includes(recipient) && matches(message));
    if (found) return found;
    await sleep(200);
  }
  throw new Error(`email was not received for ${recipient}`);
}
function verificationCode(message) {
  return message.match(/font-size:\s*32px[^>]*>(\d{6})</i)?.[1] ?? "";
}
function resetToken(message) {
  return message.match(/reset-password\?token=([A-Za-z0-9_-]+)/)?.[1] ?? "";
}
async function api(path, options = {}, jar) {
  const headers = { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(jar && cookieJars[jar] ? { Cookie: cookieJars[jar] } : {}), ...options.headers };
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers, redirect: "manual" });
  if (jar) {
    const cookies = response.headers.getSetCookie?.() ?? [];
    if (cookies.length) cookieJars[jar] = cookies.map((item) => item.split(";")[0]).join("; ");
  }
  const text = await response.text();
  let body = null; try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { response, body };
}

async function cleanup() {
  if (originalPolicy) await prisma.platformSetting.upsert({ where: { key: "auth-policy" }, create: originalPolicy, update: { value: originalPolicy.value } }).catch(() => undefined);
  else await prisma.platformSetting.deleteMany({ where: { key: "auth-policy" } }).catch(() => undefined);
  if (originalEmailSettings) await prisma.platformSetting.upsert({ where: { key: "email-settings" }, create: originalEmailSettings, update: { value: originalEmailSettings.value } }).catch(() => undefined);
  else await prisma.platformSetting.deleteMany({ where: { key: "email-settings" } }).catch(() => undefined);
  for (const key of ["smtp", "code-pay", "github", "qq", "alipay"]) {
    const original = originalIntegrations.get(key);
    if (original) await prisma.integrationSetting.upsert({ where: { key }, create: original, update: { enabled: original.enabled, publicConfig: original.publicConfig, secretEncrypted: original.secretEncrypted } }).catch(() => undefined);
    else await prisma.integrationSetting.deleteMany({ where: { key } }).catch(() => undefined);
  }
  if (createdTenantIds.length) {
    await prisma.emailDelivery.deleteMany({ where: { tenantId: { in: createdTenantIds } } }).catch(() => undefined);
    await prisma.walletEntry.deleteMany({ where: { tenantId: { in: createdTenantIds } } }).catch(() => undefined);
    await prisma.paymentOrder.deleteMany({ where: { tenantId: { in: createdTenantIds } } }).catch(() => undefined);
    await prisma.application.deleteMany({ where: { tenantId: { in: createdTenantIds } } }).catch(() => undefined);
  }
  if (createdProductIds.length) await prisma.apiProduct.deleteMany({ where: { id: { in: createdProductIds } } }).catch(() => undefined);
  if (createdProviderIds.length) await prisma.provider.deleteMany({ where: { id: { in: createdProviderIds } } }).catch(() => undefined);
  if (createdCategoryIds.length) await prisma.apiCategory.deleteMany({ where: { id: { in: createdCategoryIds } } }).catch(() => undefined);
  if (createdUserIds.length) await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }).catch(() => undefined);
  if (createdTenantIds.length) await prisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } }).catch(() => undefined);
  await prisma.$disconnect();
}

try {
  [originalPolicy, originalEmailSettings] = await Promise.all([
    prisma.platformSetting.findUnique({ where: { key: "auth-policy" } }),
    prisma.platformSetting.findUnique({ where: { key: "email-settings" } }),
  ]);
  for (const key of ["smtp", "code-pay", "github", "qq", "alipay"]) originalIntegrations.set(key, await prisma.integrationSetting.findUnique({ where: { key } }));

  const hash = await passwordHash(password);
  const adminTenant = await prisma.tenant.create({ data: { name: `${marker}-admin-space`, type: "PERSONAL", status: "ACTIVE", plan: "e2e" } });
  createdTenantIds.push(adminTenant.id);
  const admin = await prisma.user.create({ data: { name: "E2E Admin", email: adminEmail, passwordHash: hash, emailVerifiedAt: new Date(), platformRole: "ADMIN", memberships: { create: { tenantId: adminTenant.id, role: "OWNER" } } } });
  createdUserIds.push(admin.id);

  let result = await api("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ email: adminEmail, password, remember: true }) }, "admin");
  assert(result.response.status === 200 && cookieJars.admin.includes("star_api_session="), `admin login failed: ${result.response.status} ${JSON.stringify(result.body)}`);

  result = await api("/api/v1/admin/integrations", { method: "PATCH", body: JSON.stringify({ key: "github", enabled: false, publicConfig: { clientId: "" }, secrets: { clientSecret: "e2e-existing-secret" }, secretAction: "replace" }) }, "admin");
  assert(result.response.status === 200 && result.body.data.secretConfigured === true && result.body.data.configured === false, `github secret-only setup failed: ${JSON.stringify(result.body)}`);
  result = await api("/api/v1/admin/integrations", { method: "PATCH", body: JSON.stringify({ key: "github", enabled: true, publicConfig: { clientId: "e2e-client-id" }, secrets: {}, secretAction: "keep" }) }, "admin");
  assert(result.response.status === 200 && result.body.data.secretConfigured === true && result.body.data.configured === true, `github existing secret was not preserved: ${JSON.stringify(result.body)}`);
  result = await api("/api/v1/admin/integrations", { method: "PATCH", body: JSON.stringify({ key: "alipay", enabled: false, publicConfig: { appId: "", gatewayUrl: "", notifyUrl: "" }, secrets: { privateKey: "e2e-private" }, secretAction: "replace" }) }, "admin");
  assert(result.response.status === 200 && result.body.data.secretConfigured === true && result.body.data.configured === false, `alipay partial secret setup failed: ${JSON.stringify(result.body)}`);
  result = await api("/api/v1/admin/integrations", { method: "PATCH", body: JSON.stringify({ key: "alipay", enabled: true, publicConfig: { appId: "e2e-app", gatewayUrl: "https://example.com/gateway", notifyUrl: "https://example.com/notify" }, secrets: { alipayPublicKey: "e2e-public" }, secretAction: "replace" }) }, "admin");
  assert(result.response.status === 200 && result.body.data.configured === true, `alipay secret merge failed: ${JSON.stringify(result.body)}`);

  result = await api("/api/v1/admin/integrations", { method: "PATCH", body: JSON.stringify({ key: "smtp", enabled: true, publicConfig: { host: "starapi-e2e-smtp", port: 2525, fromName: "Star API E2E", fromEmail: "no-reply@example.com", username: "e2e", secure: false }, secrets: { password: "e2e-password" }, secretAction: "replace" }) }, "admin");
  assert(result.response.status === 200 && result.body.data.configured === true, `smtp setup failed: ${JSON.stringify(result.body)}`);
  result = await api("/api/v1/admin/integrations", { method: "PATCH", body: JSON.stringify({ key: "code-pay", enabled: true, publicConfig: { paymentName: "E2E Code Pay", qrImageUrl: "https://example.com/qr.png", paymentUrl: "https://example.com/pay", instructions: "E2E only" }, secrets: {}, secretAction: "keep" }) }, "admin");
  assert(result.response.status === 200 && result.body.data.configured === true, `code pay setup failed: ${JSON.stringify(result.body)}`);

  result = await api("/api/v1/admin/email-settings", {}, "admin");
  assert(result.response.status === 200, `email settings fetch failed: ${JSON.stringify(result.body)}`);
  const emailSettings = result.body.data;
  const events = ["email-verification", "password-reset", "notification-email-verification", "low-balance", "recharge-success", "account-quota-alert"];
  for (const eventId of events) {
    const preview = await api("/api/v1/admin/email-settings", { method: "POST", body: JSON.stringify({ action: "preview", eventId, ...emailSettings.templates[eventId] }) }, "admin");
    assert(preview.response.status === 200 && preview.body.data.subject && preview.body.data.html.includes("<!DOCTYPE html>"), `${eventId} preview failed: ${JSON.stringify(preview.body)}`);
  }
  emailSettings.alerts = { ...emailSettings.alerts, lowBalanceEnabled: true, lowBalanceThreshold: "35.00", quotaAlertEnabled: true, quotaThresholdPercent: 50 };
  result = await api("/api/v1/admin/email-settings", { method: "PATCH", body: JSON.stringify(emailSettings) }, "admin");
  assert(result.response.status === 200, `email settings save failed: ${JSON.stringify(result.body)}`);

  result = await api("/api/v1/admin/auth-policy", { method: "PATCH", body: JSON.stringify({ passwordLoginEnabled: true, registrationEnabled: true, registrationEmailVerificationRequired: true }) }, "admin");
  assert(result.response.status === 200, `auth policy enable failed: ${JSON.stringify(result.body)}`);
  result = await api("/api/v1/admin/integrations", { method: "PATCH", body: JSON.stringify({ key: "smtp", enabled: false, publicConfig: { host: "starapi-e2e-smtp", port: 2525, fromName: "Star API E2E", fromEmail: "no-reply@example.com", username: "e2e", secure: false }, secrets: {}, secretAction: "keep" }) }, "admin");
  assert(result.response.status === 409, `smtp safety guard missing: ${result.response.status}`);

  let messageCount = smtpMessages().length;
  result = await api("/api/v1/auth/register", { method: "POST", body: JSON.stringify({ accountType: "personal", name: "E2E User", email: userEmail, password, acceptedTerms: true }) });
  assert(result.response.status === 201 && result.body.data.nextStep === "VERIFY_EMAIL" && result.body.data.emailDeliveryFailed !== true, `register or verification email delivery failed: ${result.response.status} ${JSON.stringify(result.body)}`);
  const user = await prisma.user.findUnique({ where: { email: userEmail }, include: { memberships: true } });
  assert(user && !user.emailVerifiedAt && user.emailVerificationRequired, "new user should require email verification");
  createdUserIds.push(user.id); createdTenantIds.push(user.memberships[0].tenantId);
  result = await api("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ email: userEmail, password, remember: false }) }, "user");
  assert(result.response.status === 403 && result.body.data.emailVerificationRequired === true, `unverified login guard failed: ${JSON.stringify(result.body)}`);
  const registrationMessage = await waitForMessage(userEmail, messageCount);
  const registrationCode = verificationCode(registrationMessage);
  assert(registrationCode, "6-digit registration verification code was not found in received email");
  result = await api("/api/v1/auth/email/verify", { method: "POST", body: JSON.stringify({ email: userEmail, code: registrationCode }) }, "user");
  assert(result.response.status === 200 && cookieJars.user.includes("star_api_session="), `email verify failed: ${JSON.stringify(result.body)}`);

  const settingsPayload = { name: "E2E Personal Space", creditCode: "", notificationEmail, timezone: "Asia/Shanghai", quotaAlerts: true, balanceAlerts: true };
  messageCount = smtpMessages().length;
  result = await api("/api/v1/tenant/settings", { method: "PATCH", body: JSON.stringify(settingsPayload) }, "user");
  assert(result.response.status === 202 && result.body.data.verificationRequired, `notification email challenge failed: ${JSON.stringify(result.body)}`);
  const notificationMessage = await waitForMessage(notificationEmail, messageCount);
  const notificationCode = verificationCode(notificationMessage);
  assert(notificationCode, "notification email verification code was not found");
  result = await api("/api/v1/tenant/settings", { method: "PATCH", body: JSON.stringify({ ...settingsPayload, notificationCode }) }, "user");
  assert(result.response.status === 200 && result.body.data.notificationEmail === notificationEmail, `notification email verify failed: ${JSON.stringify(result.body)}`);

  messageCount = smtpMessages().length;
  result = await api("/api/v1/payments", { method: "POST", body: JSON.stringify({ orderType: "RECHARGE", amount: "25.50", channel: "CODE_PAY" }) }, "user");
  assert(result.response.status === 201 && result.body.data.channel === "CODE_PAY", `recharge order failed: ${JSON.stringify(result.body)}`);
  const orderId = result.body.data.id;
  result = await api("/api/v1/admin/payments", { method: "PATCH", body: JSON.stringify({ id: orderId, reference: `${marker}-payment`, note: "E2E recharge" }) }, "admin");
  assert(result.response.status === 200, `admin payment confirmation failed: ${JSON.stringify(result.body)}`);
  const rechargeMessage = await waitForMessage(notificationEmail, messageCount, 12000, (message) => message.includes("$25.50"));
  assert(rechargeMessage.includes("25.50") && rechargeMessage.includes("$"), "recharge success email content was not rendered from the configured template");
  const rechargedTenant = await prisma.tenant.findUnique({ where: { id: user.memberships[0].tenantId }, include: { walletEntries: true } });
  assert(rechargedTenant.balance.toString() === "25.5" && rechargedTenant.walletEntries.length === 1, "recharge did not update balance and ledger atomically");

  result = await api("/api/v1/admin/wallet", { method: "PATCH", body: JSON.stringify({ tenantId: rechargedTenant.id, type: "ADMIN_RECHARGE", amount: "10.00", reason: "E2E admin recharge" }) }, "admin");
  assert(result.response.status === 200 && result.body.data.balance === "35.5", `admin recharge failed: ${JSON.stringify(result.body)}`);
  messageCount = smtpMessages().length;
  result = await api("/api/v1/admin/wallet", { method: "PATCH", body: JSON.stringify({ tenantId: rechargedTenant.id, type: "ADMIN_REFUND", amount: "5.25", reason: "E2E admin refund" }) }, "admin");
  assert(result.response.status === 200 && result.body.data.balance === "30.25", `admin refund failed: ${JSON.stringify(result.body)}`);
  const lowBalanceMessage = await waitForMessage(notificationEmail, messageCount, 12000, (message) => message.includes("$30.25") && message.includes("$35"));
  assert(lowBalanceMessage.includes("30.25") && lowBalanceMessage.includes("35"), "low balance alert did not contain the real balance and threshold");
  result = await api("/api/v1/admin/wallet", { method: "PATCH", body: JSON.stringify({ tenantId: rechargedTenant.id, type: "ADMIN_REFUND", amount: "999.00", reason: "E2E over refund" }) }, "admin");
  assert(result.response.status === 409, "over-refund should be rejected");

  const provider = await prisma.provider.create({ data: { name: `${marker}-provider`, legalName: "E2E Provider", contactEmail: adminEmail } });
  const category = await prisma.apiCategory.create({ data: { name: `${marker}-category`, description: "E2E", enabled: true } });
  createdProviderIds.push(provider.id); createdCategoryIds.push(category.id);
  const slug = `${marker}-uuid`;
  const product = await prisma.apiProduct.create({ data: { providerId: provider.id, categoryId: category.id, slug, name: "E2E UUID API", description: "E2E only", tags: ["e2e"], status: "PUBLISHED", visibility: "PUBLIC", sla: new Prisma.Decimal("99.9"), internalHandler: "utility.uuid", billingMode: "PER_REQUEST", unitPrice: new Prisma.Decimal("0.100000"), freeQuotaMonthly: BigInt(0), defaultQpsLimit: 10, upstream: { create: { type: "BUILTIN", healthStatus: "HEALTHY" } }, versions: { create: { version: "v1", basePath: "http://127.0.0.1", publishedAt: new Date(), endpoints: { create: { methods: ["GET"], path: `/api/${slug}`, publicHost: "127.0.0.1", publicPath: `/api/${slug}`, routeVersion: "v1", summary: "E2E UUID", schema: {}, corsEnabled: false, forceHttps: false, ipAllowlist: [], ipDenylist: [], dailyLimit: BigInt(0) } } } } } });
  createdProductIds.push(product.id);
  const app = await prisma.application.create({ data: { tenantId: rechargedTenant.id, name: "E2E Runtime App", environment: "TEST" } });
  const apiSecret = `sk_test_${randomBytes(24).toString("base64url")}`;
  const secretHash = createHash("sha256").update(`${apiSecret}:${process.env.API_KEY_PEPPER ?? "local-development-only"}`).digest("hex");
  await prisma.apiKey.create({ data: { appId: app.id, name: "E2E Key", prefix: apiSecret.slice(0, 16), secretHash, scopes: [] } });
  const subscription = await prisma.subscription.create({ data: { appId: app.id, productId: product.id, quotaMonthly: BigInt(2), qpsLimit: 10, unitPrice: new Prisma.Decimal("0.100000") } });
  messageCount = smtpMessages().length;
  result = await api(`/api/${slug}`, { headers: { Authorization: `Bearer ${apiSecret}`, "X-Forwarded-Host": "127.0.0.1", "X-Forwarded-Proto": "http" } });
  assert(result.response.status === 200 && result.body.data.uuid, `billable gateway request failed: ${JSON.stringify(result.body)}`);
  const quotaMessage = await waitForMessage(notificationEmail, messageCount, 12000, (message) => message.includes("1 / 2"));
  assert(quotaMessage.includes(app.name) && quotaMessage.includes("1 / 2"), "quota alert did not contain the real application and quota usage");
  const usageEntry = await prisma.walletEntry.findFirst({ where: { tenantId: rechargedTenant.id, type: "API_USAGE" } });
  assert(usageEntry?.delta.toString() === "-0.1" && usageEntry.balanceAfter.toString() === "30.15", "API usage was not deducted and recorded atomically");
  const deliveryCount = await prisma.emailDelivery.count({ where: { dedupeKey: `account-quota-alert:${subscription.id}:${new Date().toISOString().slice(0, 7)}`, status: "SENT" } });
  assert(deliveryCount === 1, "quota alert was not recorded as one idempotent delivery");

  messageCount = smtpMessages().length;
  result = await api("/api/v1/auth/password/forgot", { method: "POST", body: JSON.stringify({ email: userEmail }) });
  assert(result.response.status === 200, `password reset request failed: ${JSON.stringify(result.body)}`);
  const resetMessage = await waitForMessage(userEmail, messageCount);
  const token = resetToken(resetMessage);
  assert(token, "password reset token was not found in the received email");
  result = await api("/api/v1/auth/password/reset", { method: "POST", body: JSON.stringify({ token, password: nextPassword }) });
  assert(result.response.status === 200, `password reset failed: ${JSON.stringify(result.body)}`);
  result = await api("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ email: userEmail, password: nextPassword, remember: false }) }, "reset");
  assert(result.response.status === 200 && cookieJars.reset.includes("star_api_session="), `login with reset password failed: ${JSON.stringify(result.body)}`);

  const ledgerCount = await prisma.walletEntry.count({ where: { tenantId: rechargedTenant.id } });
  assert(ledgerCount === 4, `expected 4 wallet entries, got ${ledgerCount}`);
  console.log(JSON.stringify({ ok: true, checks: ["admin-login", "github-secret-preserved", "payment-secret-merge", "six-event-preview", "smtp-send", "registration-policy", "email-verification-code", "notification-email-verification", "code-pay-recharge", "recharge-email", "low-balance-alert", "quota-alert", "api-usage-ledger", "password-reset", "admin-recharge", "admin-refund", "over-refund-guard"] }, null, 2));
} finally {
  await cleanup();
}
