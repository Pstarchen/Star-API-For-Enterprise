import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

const portalUrl = requiredEnv("STRESS_PORTAL_URL").replace(/\/$/, "");
const installToken = requiredEnv("STRESS_INSTALL_TOKEN");
const runId = Date.now().toString(36);
const password = `Stress-${runId}-Pass9`;
const summaries = [];

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function cookieFrom(response) {
  return response.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
}

function targetUrl(path) {
  return new URL(path, `${portalUrl}/`).toString();
}

async function request(path, options = {}, cookie = "") {
  const headers = new Headers(options.headers);
  if (cookie) headers.set("Cookie", cookie);
  return fetch(targetUrl(path), { ...options, headers, redirect: options.redirect ?? "manual" });
}

async function jsonRequest(path, options = {}, cookie = "") {
  const response = await request(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  }, cookie);
  const body = await response.json().catch(() => null);
  return { response, body };
}

function expectStatus(actual, expected, label, body) {
  assert.equal(actual, expected, `${label}: expected ${expected}, received ${actual}; body=${JSON.stringify(body)}`);
}

function percentile(values, percentileValue) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil((percentileValue / 100) * sorted.length) - 1)];
}

async function runBurst(label, { total, concurrency, operation }) {
  const latencies = [];
  const statuses = new Map();
  const errors = [];
  let cursor = 0;
  const startedAt = performance.now();

  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= total) return;
      const requestStartedAt = performance.now();
      try {
        const response = await operation(index);
        latencies.push(performance.now() - requestStartedAt);
        statuses.set(response.status, (statuses.get(response.status) ?? 0) + 1);
        await response.arrayBuffer();
      } catch (error) {
        latencies.push(performance.now() - requestStartedAt);
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(total, concurrency) }, () => worker()));
  const durationMs = performance.now() - startedAt;
  const summary = {
    label,
    total,
    concurrency,
    durationMs,
    requestsPerSecond: total / Math.max(durationMs / 1000, 0.001),
    averageMs: latencies.reduce((sum, value) => sum + value, 0) / Math.max(latencies.length, 1),
    p95Ms: percentile(latencies, 95),
    p99Ms: percentile(latencies, 99),
    statuses: Object.fromEntries([...statuses.entries()].sort(([left], [right]) => left - right)),
    errors,
  };
  summaries.push(summary);
  console.log(
    `STRESS ${label}: ${summary.requestsPerSecond.toFixed(1)} req/s, avg=${summary.averageMs.toFixed(1)}ms, p95=${summary.p95Ms.toFixed(1)}ms, p99=${summary.p99Ms.toFixed(1)}ms, statuses=${JSON.stringify(summary.statuses)}, transportErrors=${errors.length}`,
  );
  return summary;
}

async function createApi(cookie, categoryId, config, assets = []) {
  const form = new FormData();
  form.set("config", JSON.stringify({
    sourceType: "STATIC_JSON",
    categoryId,
    color: "#586be8",
    tags: ["stress"],
    publicHost: new URL(portalUrl).hostname,
    publicPath: `/api/${config.slug}`,
    visibility: "PUBLIC",
    methods: ["GET"],
    responseFormats: ["JSON"],
    parameters: [],
    responseParameters: [],
    path: "/",
    requestFormat: "JSON",
    forceHttps: false,
    requestLogging: true,
    dailyLimit: 0,
    billingMode: "FREE",
    unitPrice: 0,
    freeQuotaMonthly: 0,
    defaultQpsLimit: 1000,
    sla: 99.9,
    content: JSON.stringify({ ok: true, runId }),
    ...config,
  }));
  for (const asset of assets) form.append("assets", new Blob([asset.content], { type: asset.type }), asset.name);
  const response = await request("/api/v1/admin/apis", { method: "POST", body: form }, cookie);
  const body = await response.json().catch(() => null);
  expectStatus(response.status, 201, `create ${config.name}`, body);
  return body.data;
}

function datasetReplacement(productId, batch, files = 2) {
  const form = new FormData();
  form.set("productId", productId);
  for (let index = 0; index < files; index += 1) {
    const item = String.fromCharCode(65 + index);
    form.append("assets", new Blob([JSON.stringify([{ batch, item }])], { type: "application/json" }), `batch-${batch}-${item}.json`);
  }
  return form;
}

async function publishApi(cookie, product) {
  const result = await jsonRequest("/api/v1/admin/apis", { method: "PATCH", body: { id: product.id, status: "PUBLISHED" } }, cookie);
  expectStatus(result.response.status, 200, `publish ${product.name}`, result.body);
}

async function subscribe(cookie, appId, product) {
  const result = await jsonRequest("/api/v1/subscriptions", { method: "POST", body: { appId, productId: product.id } }, cookie);
  expectStatus(result.response.status, 201, `subscribe ${product.name}`, result.body);
  return result.body.data;
}

async function adminSubscriptions(cookie) {
  const result = await jsonRequest("/api/v1/admin/subscriptions", {}, cookie);
  expectStatus(result.response.status, 200, "read administrator subscriptions", result.body);
  return result.body.data;
}

async function updateSubscriptionPolicy(cookie, id, quotaMonthly, qpsLimit) {
  const result = await jsonRequest("/api/v1/admin/subscriptions", { method: "PATCH", body: { id, quotaMonthly, qpsLimit } }, cookie);
  expectStatus(result.response.status, 200, "update subscription policy", result.body);
  return result.body.data;
}

function assertNoServerErrors(summary) {
  assert.equal(summary.errors.length, 0, `${summary.label} had transport errors: ${summary.errors.join("; ")}`);
  const serverErrors = Object.entries(summary.statuses).filter(([status]) => Number(status) >= 500);
  assert.deepEqual(serverErrors, [], `${summary.label} returned server errors: ${JSON.stringify(summary.statuses)}`);
}

async function main() {
  let response;
  let result = await jsonRequest("/api/v1/install");
  expectStatus(result.response.status, 200, "installer status", result.body);
  assert.equal(result.body.data.installed, false, "stress environment must start uninstalled");

  const adminEmail = `admin-${runId}@stress.test`;
  result = await jsonRequest("/api/v1/install", { method: "POST", body: {
    installToken,
    platformName: "Star API Stress",
    platformDescription: "Isolated concurrency and consistency verification environment.",
    publicUrl: portalUrl,
    adminName: "Stress Admin",
    adminEmail,
    adminPassword: password,
  } });
  expectStatus(result.response.status, 201, "install platform", result.body);
  const adminCookie = cookieFrom(result.response);
  assert.ok(adminCookie, "installer must return an administrator session");

  result = await jsonRequest("/api/v1/auth/me", {}, adminCookie);
  expectStatus(result.response.status, 200, "read administrator", result.body);
  const adminTenantId = result.body.data.workspaces[0]?.id;
  assert.ok(adminTenantId, "administrator workspace must exist");

  result = await jsonRequest("/api/v1/admin/api-categories", {}, adminCookie);
  expectStatus(result.response.status, 200, "read categories", result.body);
  const categoryId = result.body.data[0]?.id;
  assert.ok(categoryId, "at least one API category must exist");

  const freeApi = await createApi(adminCookie, categoryId, { name: "Free Concurrency", slug: `free-${runId}` });
  const paidApi = await createApi(adminCookie, categoryId, { name: "Paid Concurrency", slug: `paid-${runId}`, billingMode: "PER_REQUEST", unitPrice: 0.01 });
  const balanceApi = await createApi(adminCookie, categoryId, { name: "Balance Boundary", slug: `balance-${runId}`, billingMode: "PER_REQUEST", unitPrice: 0.1 });
  const qpsApi = await createApi(adminCookie, categoryId, { name: "QPS Boundary", slug: `qps-${runId}`, defaultQpsLimit: 8 });
  const monthlyApi = await createApi(adminCookie, categoryId, { name: "Monthly Quota Boundary", slug: `monthly-${runId}` });
  const dailyApi = await createApi(adminCookie, categoryId, { name: "Daily Limit Boundary", slug: `daily-${runId}`, dailyLimit: 7 });
  const lifecycleApi = await createApi(adminCookie, categoryId, { name: "Subscription Lifecycle", slug: `lifecycle-${runId}` });
  const datasetApi = await createApi(adminCookie, categoryId, {
    sourceType: "DATASET",
    name: "Atomic Dataset Replacement",
    slug: `dataset-${runId}`,
    methods: ["GET", "POST"],
    responseFormats: ["JSON"],
    dataset: { grouping: "FILE", categoryParameter: "category", formatParameter: "format", menuValue: "list", defaultFormat: "JSON", textField: "", itemsPath: "", contractMode: "AUTO" },
    content: "",
  }, [{ name: "initial.json", type: "application/json", content: JSON.stringify([{ batch: "initial", item: "A" }]) }]);
  const mediaApi = await createApi(adminCookie, categoryId, { sourceType: "RANDOM_IMAGE", name: "Concurrent Media", slug: `media-${runId}`, responseFormats: ["BINARY"], content: "" });
  for (const product of [freeApi, paidApi, balanceApi, qpsApi, monthlyApi, dailyApi, lifecycleApi]) await publishApi(adminCookie, product);

  result = await jsonRequest("/api/v1/apps", { method: "POST", body: { name: `Stress App ${runId}`, environment: "TEST" } }, adminCookie);
  expectStatus(result.response.status, 201, "create stress application", result.body);
  const appId = result.body.data.app.id;
  const apiKey = result.body.data.secret;
  assert.ok(apiKey, "application creation must return its initial API key");
  for (const product of [freeApi, paidApi, balanceApi, qpsApi, monthlyApi, dailyApi]) await subscribe(adminCookie, appId, product);

  result = await jsonRequest("/api/v1/admin/wallet", { method: "PATCH", body: { tenantId: adminTenantId, type: "ADMIN_RECHARGE", amount: "1.10", reason: "Isolated stress-test credit" } }, adminCookie);
  expectStatus(result.response.status, 200, "fund stress wallet", result.body);
  assert.equal(Number(result.body.data.balance), 1.1);

  const duplicateEmail = `duplicate-${runId}@stress.test`;
  const concurrentRegistrations = await runBurst("concurrent same-email registration", {
    total: 12,
    concurrency: 12,
    operation: () => request("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountType: "personal", name: "Duplicate Stress", email: duplicateEmail, password, acceptedTerms: true }),
    }),
  });
  assertNoServerErrors(concurrentRegistrations);
  assert.equal(concurrentRegistrations.statuses[201], 1, `only one same-email registration may succeed: ${JSON.stringify(concurrentRegistrations.statuses)}`);
  assert.equal(concurrentRegistrations.statuses[409], 11, `duplicate registrations must conflict: ${JSON.stringify(concurrentRegistrations.statuses)}`);

  const walletEntriesBefore = (await jsonRequest("/api/v1/wallet", {}, adminCookie)).body.data.entries.length;
  const concurrentRecharges = await runBurst("concurrent administrator recharges", {
    total: 20,
    concurrency: 20,
    operation: (index) => request("/api/v1/admin/wallet", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId: adminTenantId, type: "ADMIN_RECHARGE", amount: "1.00", reason: `Concurrent recharge ${index}` }),
    }, adminCookie),
  });
  assertNoServerErrors(concurrentRecharges);
  assert.deepEqual(concurrentRecharges.statuses, { 200: 20 });
  result = await jsonRequest("/api/v1/wallet", {}, adminCookie);
  expectStatus(result.response.status, 200, "wallet after concurrent recharges", result.body);
  assert.equal(Number(result.body.data.balance), 21.1, "twenty concurrent recharges must credit exactly 20.00");

  const concurrentRefunds = await runBurst("concurrent administrator refunds", {
    total: 20,
    concurrency: 20,
    operation: (index) => request("/api/v1/admin/wallet", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId: adminTenantId, type: "ADMIN_REFUND", amount: "1.00", reason: `Concurrent refund ${index}` }),
    }, adminCookie),
  });
  assertNoServerErrors(concurrentRefunds);
  assert.deepEqual(concurrentRefunds.statuses, { 200: 20 });
  result = await jsonRequest("/api/v1/wallet", {}, adminCookie);
  expectStatus(result.response.status, 200, "wallet after concurrent refunds", result.body);
  assert.equal(Number(result.body.data.balance), 1.1, "matching concurrent refunds must restore the original balance");
  assert.equal(result.body.data.entries.length - walletEntriesBefore, 40, "every successful administrator adjustment must create one ledger entry");

  result = await jsonRequest("/api/v1/admin/integrations", { method: "PATCH", body: { key: "code-pay", enabled: true, publicConfig: { paymentName: "Stress Code Pay", paymentUrl: "https://example.com/pay", qrImageUrl: "", instructions: "Stress verification only" }, secrets: {}, secretAction: "keep" } }, adminCookie);
  expectStatus(result.response.status, 200, "enable stress code-pay channel", result.body);
  result = await jsonRequest("/api/v1/payments", { method: "POST", body: { orderType: "RECHARGE", amount: "3.25", channel: "CODE_PAY" } }, adminCookie);
  expectStatus(result.response.status, 201, "create concurrent settlement order", result.body);
  const paymentOrderId = result.body.data.id;
  const concurrentSettlements = await runBurst("concurrent payment settlement", {
    total: 12,
    concurrency: 12,
    operation: (index) => request("/api/v1/admin/payments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: paymentOrderId, reference: `stress-settlement-${index}`, note: "Concurrent settlement" }),
    }, adminCookie),
  });
  assertNoServerErrors(concurrentSettlements);
  assert.ok((concurrentSettlements.statuses[200] ?? 0) >= 1, `at least one administrator settlement must succeed: ${JSON.stringify(concurrentSettlements.statuses)}`);
  assert.equal((concurrentSettlements.statuses[200] ?? 0) + (concurrentSettlements.statuses[409] ?? 0), 12, `duplicate settlements must be idempotent successes or state conflicts: ${JSON.stringify(concurrentSettlements.statuses)}`);
  result = await jsonRequest("/api/v1/wallet", {}, adminCookie);
  expectStatus(result.response.status, 200, "wallet after concurrent settlement", result.body);
  assert.equal(Number(result.body.data.balance), 4.35, "a payment order must credit the wallet exactly once");
  assert.equal(result.body.data.entries.filter((entry) => entry.type === "RECHARGE").length, 1, "settlement must create one payment ledger entry");
  result = await jsonRequest("/api/v1/admin/wallet", { method: "PATCH", body: { tenantId: adminTenantId, type: "ADMIN_REFUND", amount: "3.25", reason: "Restore gateway stress-test baseline" } }, adminCookie);
  expectStatus(result.response.status, 200, "restore wallet baseline after settlement test", result.body);
  assert.equal(Number(result.body.data.balance), 1.1);

  const statusUpdates = await runBurst("concurrent application pause", {
    total: 12,
    concurrency: 12,
    operation: () => request("/api/v1/apps", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: appId, status: "paused" }) }, adminCookie),
  });
  assertNoServerErrors(statusUpdates);
  assert.deepEqual(statusUpdates.statuses, { 200: 12 });
  response = await request(freeApi.endpoint, { headers: { Authorization: `Bearer ${apiKey}` } });
  const pausedBody = await response.json();
  expectStatus(response.status, 401, "paused application blocks gateway calls", pausedBody);
  assert.equal(pausedBody.code, "INVALID_API_KEY", "paused applications must invalidate their API keys at the authentication boundary");
  result = await jsonRequest("/api/v1/apps", { method: "PATCH", body: { id: appId, status: "active" } }, adminCookie);
  expectStatus(result.response.status, 200, "resume application after concurrent pause", result.body);
  response = await request(freeApi.endpoint, { headers: { Authorization: `Bearer ${apiKey}` } });
  expectStatus(response.status, 200, "resumed application restores gateway calls", await response.json());

  const replacementBatches = Array.from({ length: 8 }, (_, index) => `set-${index}`);
  const concurrentReplacements = await runBurst("concurrent dataset replacement", {
    total: replacementBatches.length,
    concurrency: replacementBatches.length,
    operation: (index) => request("/api/v1/admin/apis/assets", { method: "POST", body: datasetReplacement(datasetApi.id, replacementBatches[index]) }, adminCookie),
  });
  assertNoServerErrors(concurrentReplacements);
  assert.deepEqual(concurrentReplacements.statuses, { 201: replacementBatches.length });
  result = await jsonRequest(`/api/v1/admin/apis/assets?productId=${encodeURIComponent(datasetApi.id)}`, {}, adminCookie);
  expectStatus(result.response.status, 200, "dataset after concurrent replacement", result.body);
  assert.equal(result.body.data.length, 2, "atomic replacement must retain one complete two-file batch");
  const retainedBatch = result.body.data[0]?.name.match(/^batch-(set-\d+)-/)?.[1];
  assert.ok(replacementBatches.includes(retainedBatch), `unexpected retained dataset batch: ${JSON.stringify(result.body.data)}`);
  assert.ok(result.body.data.every((asset) => asset.name.startsWith(`batch-${retainedBatch}-`)), "concurrent replacement must not mix files from different batches");

  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nZcAAAAASUVORK5CYII=", "base64");
  const concurrentMedia = await runBurst("concurrent media upload", {
    total: 20,
    concurrency: 20,
    operation: (index) => request(`/api/v1/admin/apis/media?productId=${encodeURIComponent(mediaApi.id)}`, { method: "POST", headers: { "Content-Type": "image/png", "X-File-Name": encodeURIComponent(`pixel-${index}.png`) }, body: png }, adminCookie),
  });
  assertNoServerErrors(concurrentMedia);
  assert.deepEqual(concurrentMedia.statuses, { 201: 20 });
  result = await jsonRequest(`/api/v1/admin/apis/assets?productId=${encodeURIComponent(mediaApi.id)}`, {}, adminCookie);
  expectStatus(result.response.status, 200, "media after concurrent upload", result.body);
  assert.equal(result.body.meta.total, 20, "every successful concurrent media upload must be persisted once");

  const publicPages = await runBurst("public pages", {
    total: 120,
    concurrency: 20,
    operation: (index) => request(["/", "/marketplace", "/pricing", "/docs"][index % 4]),
  });
  assertNoServerErrors(publicPages);
  assert.deepEqual(publicPages.statuses, { 200: 120 });

  const adminReads = await runBurst("administrator reads", {
    total: 120,
    concurrency: 20,
    operation: (index) => request(["/api/v1/admin/apis/statistics", "/api/v1/admin/wallet", "/api/v1/admin/api-categories"][index % 3], {}, adminCookie),
  });
  assertNoServerErrors(adminReads);
  assert.deepEqual(adminReads.statuses, { 200: 120 });

  const freeGateway = await runBurst("free gateway", {
    total: 200,
    concurrency: 40,
    operation: () => request(freeApi.endpoint, { headers: { Authorization: `Bearer ${apiKey}` } }),
  });
  assertNoServerErrors(freeGateway);
  assert.deepEqual(freeGateway.statuses, { 200: 200 });

  const paidGateway = await runBurst("paid gateway", {
    total: 60,
    concurrency: 30,
    operation: () => request(paidApi.endpoint, { headers: { Authorization: `Bearer ${apiKey}` } }),
  });
  assertNoServerErrors(paidGateway);
  assert.deepEqual(paidGateway.statuses, { 200: 60 });

  result = await jsonRequest("/api/v1/wallet", {}, adminCookie);
  expectStatus(result.response.status, 200, "wallet after paid burst", result.body);
  assert.equal(Number(result.body.data.balance), 0.5, "60 paid calls at 0.01 must debit exactly 0.60");
  assert.equal(result.body.data.entries.filter((entry) => entry.type === "API_USAGE").length, 60, "every charged request must have one wallet entry");

  const balanceBoundary = await runBurst("balance boundary", {
    total: 12,
    concurrency: 12,
    operation: () => request(balanceApi.endpoint, { headers: { Authorization: `Bearer ${apiKey}` } }),
  });
  assertNoServerErrors(balanceBoundary);
  assert.equal(balanceBoundary.statuses[200], 5, "a 0.50 balance must allow exactly five 0.10 calls");
  assert.equal(balanceBoundary.statuses[402], 7, "requests beyond available balance must return 402");

  result = await jsonRequest("/api/v1/wallet", {}, adminCookie);
  expectStatus(result.response.status, 200, "wallet after balance boundary", result.body);
  assert.equal(Number(result.body.data.balance), 0, "balance boundary must stop exactly at zero");
  assert.equal(result.body.data.entries.filter((entry) => entry.type === "API_USAGE").length, 65, "wallet entries must equal successful charged calls");

  await new Promise((resolve) => setTimeout(resolve, 2100));
  const qpsBoundary = await runBurst("QPS boundary", {
    total: 40,
    concurrency: 40,
    operation: () => request(qpsApi.endpoint, { headers: { Authorization: `Bearer ${apiKey}` } }),
  });
  assertNoServerErrors(qpsBoundary);
  assert.ok((qpsBoundary.statuses[200] ?? 0) <= 8, `QPS limit allowed too many requests: ${JSON.stringify(qpsBoundary.statuses)}`);
  assert.ok((qpsBoundary.statuses[429] ?? 0) >= 32, `QPS limit did not reject enough requests: ${JSON.stringify(qpsBoundary.statuses)}`);

  let subscriptions = await adminSubscriptions(adminCookie);
  const monthlySubscription = subscriptions.find((item) => item.app.id === appId && item.product.id === monthlyApi.id);
  assert.ok(monthlySubscription, "monthly quota subscription must exist");
  await updateSubscriptionPolicy(adminCookie, monthlySubscription.id, 9, 1000);
  const monthlyBoundary = await runBurst("monthly quota boundary", {
    total: 30,
    concurrency: 30,
    operation: () => request(monthlyApi.endpoint, { headers: { Authorization: `Bearer ${apiKey}` } }),
  });
  assertNoServerErrors(monthlyBoundary);
  assert.equal(monthlyBoundary.statuses[200], 9, `monthly quota must allow exactly nine calls: ${JSON.stringify(monthlyBoundary.statuses)}`);
  assert.equal(monthlyBoundary.statuses[429], 21, `monthly quota must reject calls beyond nine: ${JSON.stringify(monthlyBoundary.statuses)}`);

  const dailyBoundary = await runBurst("daily limit boundary", {
    total: 25,
    concurrency: 25,
    operation: () => request(dailyApi.endpoint, { headers: { Authorization: `Bearer ${apiKey}` } }),
  });
  assertNoServerErrors(dailyBoundary);
  assert.equal(dailyBoundary.statuses[200], 7, `daily limit must allow exactly seven calls: ${JSON.stringify(dailyBoundary.statuses)}`);
  assert.equal(dailyBoundary.statuses[429], 18, `daily limit must reject calls beyond seven: ${JSON.stringify(dailyBoundary.statuses)}`);

  subscriptions = await adminSubscriptions(adminCookie);
  assert.equal(subscriptions.find((item) => item.id === monthlySubscription.id)?.usageThisMonth, 9, "monthly quota usage must equal successful reserved calls");
  assert.equal(subscriptions.find((item) => item.product.id === dailyApi.id && item.app.id === appId)?.usageToday, 7, "daily usage must equal successful reserved calls");

  const firstSubscriptions = await runBurst("concurrent first subscription", {
    total: 12,
    concurrency: 12,
    operation: () => request("/api/v1/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId, productId: lifecycleApi.id }),
    }, adminCookie),
  });
  assertNoServerErrors(firstSubscriptions);
  assert.equal(firstSubscriptions.statuses[201], 1, `only one first subscription may succeed: ${JSON.stringify(firstSubscriptions.statuses)}`);
  assert.equal(firstSubscriptions.statuses[409], 11, `duplicate subscriptions must conflict: ${JSON.stringify(firstSubscriptions.statuses)}`);
  subscriptions = await adminSubscriptions(adminCookie);
  const lifecycleSubscription = subscriptions.find((item) => item.app.id === appId && item.product.id === lifecycleApi.id);
  assert.ok(lifecycleSubscription, "lifecycle subscription must exist after concurrent creation");

  const concurrentCancels = await runBurst("concurrent subscription cancellation", {
    total: 8,
    concurrency: 8,
    operation: () => request(`/api/v1/subscriptions?id=${encodeURIComponent(lifecycleSubscription.id)}`, { method: "DELETE" }, adminCookie),
  });
  assertNoServerErrors(concurrentCancels);
  assert.equal(concurrentCancels.statuses[200], 1, `only one cancellation may transition the subscription: ${JSON.stringify(concurrentCancels.statuses)}`);
  assert.equal(concurrentCancels.statuses[409], 7, `duplicate cancellations must conflict: ${JSON.stringify(concurrentCancels.statuses)}`);

  const concurrentResubscriptions = await runBurst("concurrent subscription reactivation", {
    total: 8,
    concurrency: 8,
    operation: () => request("/api/v1/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId, productId: lifecycleApi.id }),
    }, adminCookie),
  });
  assertNoServerErrors(concurrentResubscriptions);
  assert.equal(concurrentResubscriptions.statuses[201], 1, `only one reactivation may succeed: ${JSON.stringify(concurrentResubscriptions.statuses)}`);
  assert.equal(concurrentResubscriptions.statuses[409], 7, `duplicate reactivations must conflict: ${JSON.stringify(concurrentResubscriptions.statuses)}`);

  const keyCreations = [];
  const concurrentKeys = await runBurst("concurrent API key creation", {
    total: 16,
    concurrency: 16,
    operation: async (index) => {
      const response = await request("/api/v1/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId, name: `Concurrent Key ${index}`, environment: "test", scopes: [] }),
      }, adminCookie);
      const body = await response.clone().json().catch(() => null);
      if (response.ok) keyCreations.push(body.data);
      return response;
    },
  });
  assertNoServerErrors(concurrentKeys);
  assert.deepEqual(concurrentKeys.statuses, { 201: 16 });
  assert.equal(new Set(keyCreations.map((item) => item.id)).size, 16, "concurrent API key IDs must be unique");
  assert.equal(new Set(keyCreations.map((item) => item.secret)).size, 16, "concurrent API key secrets must be unique");
  const revocationTarget = keyCreations[0];
  const concurrentRevocations = await runBurst("concurrent API key revocation", {
    total: 8,
    concurrency: 8,
    operation: () => request("/api/v1/keys", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: revocationTarget.id }),
    }, adminCookie),
  });
  assertNoServerErrors(concurrentRevocations);
  assert.equal(concurrentRevocations.statuses[200], 1, `only one API key revocation may succeed: ${JSON.stringify(concurrentRevocations.statuses)}`);
  assert.equal(concurrentRevocations.statuses[409], 7, `duplicate API key revocations must conflict: ${JSON.stringify(concurrentRevocations.statuses)}`);

  const userEmail = `user-${runId}@stress.test`;
  result = await jsonRequest("/api/v1/auth/register", { method: "POST", body: { accountType: "personal", name: "Stress User", email: userEmail, password, acceptedTerms: true } });
  expectStatus(result.response.status, 201, "register throttle test user", result.body);
  const throttleIp = `198.51.100.${Number.parseInt(runId.slice(-2), 36) % 200 + 1}`;
  const invalidLogins = await runBurst("concurrent invalid login", {
    total: 6,
    concurrency: 6,
    operation: () => request("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": throttleIp },
      body: JSON.stringify({ email: userEmail, password: `${password}-wrong`, remember: false }),
    }),
  });
  assertNoServerErrors(invalidLogins);
  assert.ok(Object.keys(invalidLogins.statuses).every((status) => ["401", "429"].includes(status)), `unexpected invalid-login status: ${JSON.stringify(invalidLogins.statuses)}`);
  result = await jsonRequest("/api/v1/auth/login", { method: "POST", headers: { "X-Forwarded-For": throttleIp }, body: { email: userEmail, password, remember: false } });
  expectStatus(result.response.status, 429, "concurrent failures trigger login block", result.body);
  result = await jsonRequest("/api/v1/auth/login", { method: "POST", headers: { "X-Forwarded-For": "203.0.113.10" }, body: { email: userEmail, password, remember: false } });
  expectStatus(result.response.status, 200, "login throttle remains scoped to source", result.body);

  console.log(`Stress E2E passed: ${summaries.length} scenarios.`);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
