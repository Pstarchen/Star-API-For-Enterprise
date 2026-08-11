import assert from "node:assert/strict";
import { createServer, request as httpRequest } from "node:http";
import { zipSync, strToU8 } from "fflate";

const portalUrl = requiredEnv("E2E_PORTAL_URL").replace(/\/$/, "");
const apiUrl = requiredEnv("E2E_API_URL").replace(/\/$/, "");
const apiConnectUrl = (process.env.E2E_API_CONNECT_URL ?? apiUrl).replace(/\/$/, "");
const installToken = requiredEnv("E2E_INSTALL_TOKEN");
const runId = Date.now().toString(36);
const password = `Smoke-${runId}-Pass9`;
const results = [];
const localUpstreamPort = Number(process.env.E2E_LOCAL_UPSTREAM_PORT ?? 19090);
const localServer = createServer((request, response) => {
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify({ ok: true, source: "server-local", path: request.url }));
});

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function cookieFrom(response) {
  return response.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
}

async function request(path, options = {}, cookie = "", base = portalUrl) {
  const headers = new Headers(options.headers);
  if (cookie) headers.set("Cookie", cookie);
  const targetBase = base === apiUrl ? apiConnectUrl : base;
  if (base === apiUrl && targetBase !== apiUrl) {
    headers.set("Host", new URL(apiUrl).hostname);
    if (options.body) throw new Error("E2E gateway transport currently supports bodyless requests only");
    return new Promise((resolve, reject) => {
      const outgoing = httpRequest(`${targetBase}${path}`, { method: options.method ?? "GET", headers: Object.fromEntries(headers) }, (incoming) => {
        const chunks = [];
        incoming.on("data", (chunk) => chunks.push(chunk));
        incoming.on("end", () => resolve(new Response(Buffer.concat(chunks), { status: incoming.statusCode ?? 500, headers: incoming.headers })));
      });
      outgoing.once("error", reject);
      outgoing.end();
    });
  }
  return fetch(`${targetBase}${path}`, { ...options, headers, redirect: options.redirect ?? "manual" });
}

async function jsonRequest(path, options = {}, cookie = "", base = portalUrl) {
  const response = await request(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  }, cookie, base);
  const body = await response.json().catch(() => null);
  return { response, body };
}

function expectStatus(actual, expected, label, body) {
  assert.equal(actual, expected, `${label}: expected ${expected}, received ${actual}; body=${JSON.stringify(body)}`);
  results.push(label);
  console.log(`PASS ${label}`);
}

async function createApi(cookie, config, assets = []) {
  const form = new FormData();
  form.set("config", JSON.stringify({
    category: "其他",
    color: "#586be8",
    tags: ["e2e"],
    publicHost: new URL(apiUrl).hostname,
    publicPath: `/${config.slug}`,
    visibility: "PUBLIC",
    method: "GET",
    path: "/",
    requestFormat: "JSON",
    forceHttps: false,
    requestLogging: true,
    dailyLimit: 0,
    billingMode: "FREE",
    unitPrice: 0,
    freeQuotaMonthly: 0,
    defaultQpsLimit: 20,
    sla: 99.9,
    ...config,
  }));
  for (const asset of assets) form.append("assets", asset.blob, asset.name);
  const response = await request("/api/v1/admin/apis", { method: "POST", body: form }, cookie);
  const body = await response.json().catch(() => null);
  expectStatus(response.status, 201, `create ${config.sourceType} API`, body);
  return body.data;
}

async function publishApi(cookie, product) {
  const { response, body } = await jsonRequest("/api/v1/admin/apis", { method: "PATCH", body: { id: product.id, status: "PUBLISHED" } }, cookie);
  expectStatus(response.status, 200, `publish ${product.slug}`, body);
}

async function subscribe(cookie, appId, productId, slug) {
  const { response, body } = await jsonRequest("/api/v1/subscriptions", { method: "POST", body: { appId, productId } }, cookie);
  expectStatus(response.status, 201, `subscribe ${slug}`, body);
  return body;
}

async function main() {
  let response = await request("/api/health");
  expectStatus(response.status, 200, "application health", await response.text());

  let result = await jsonRequest("/api/v1/install");
  expectStatus(result.response.status, 200, "installer status before setup", result.body);
  assert.equal(result.body.data.installed, false);

  const adminEmail = `admin-${runId}@example.test`;
  result = await jsonRequest("/api/v1/install", { method: "POST", body: {
    installToken,
    platformName: "Star-API E2E",
    platformDescription: "Automated end-to-end verification environment.",
    publicUrl: portalUrl,
    adminName: "Smoke Admin",
    adminEmail,
    adminPassword: password,
  } });
  expectStatus(result.response.status, 201, "first installation", result.body);
  const adminCookie = cookieFrom(result.response);
  assert.ok(adminCookie, "installer must create an administrator session");

  result = await jsonRequest("/api/v1/auth/me", {}, adminCookie);
  expectStatus(result.response.status, 200, "administrator session", result.body);
  assert.equal(result.body.data.platformRole, "ADMIN");

  for (const page of ["/admin", "/admin/apis", "/admin/testing", "/admin/providers", "/admin/users", "/admin/settings", "/admin/settings/auth", "/admin/settings/integrations", "/admin/settings/payments", "/admin/monitor", "/admin/audits"]) {
    response = await request(page, {}, adminCookie);
    expectStatus(response.status, 200, `administrator page ${page}`, await response.text());
  }

  result = await jsonRequest("/api/v1/admin/auth-policy", {}, adminCookie);
  expectStatus(result.response.status, 200, "read authentication policy", result.body);
  assert.deepEqual(result.body.data, { passwordLoginEnabled: true, registrationEnabled: true });

  response = await request("/api/v1/auth/github");
  expectStatus(response.status, 302, "GitHub disabled redirect", await response.text());
  assert.match(response.headers.get("location") ?? "", /github_not_configured/);

  result = await jsonRequest("/api/v1/admin/integrations", { method: "PATCH", body: {
    key: "github",
    enabled: true,
    publicConfig: { clientId: "e2e-client-id" },
    secrets: { clientSecret: "e2e-client-secret" },
    secretAction: "replace",
  } }, adminCookie);
  expectStatus(result.response.status, 200, "enable GitHub configuration", result.body);

  response = await request("/api/v1/auth/github");
  expectStatus(response.status, 302, "GitHub enabled authorization redirect", await response.text());
  const githubLocation = response.headers.get("location") ?? "";
  assert.equal(new URL(githubLocation).hostname, "github.com");
  assert.ok(new URL(githubLocation).searchParams.get("state"), "GitHub authorization must include state");

  result = await jsonRequest("/api/v1/admin/auth-policy", { method: "PATCH", body: { passwordLoginEnabled: false, registrationEnabled: false } }, adminCookie);
  expectStatus(result.response.status, 409, "prevent administrator login lockout", result.body);

  result = await jsonRequest("/api/v1/admin/auth-policy", { method: "PATCH", body: { passwordLoginEnabled: true, registrationEnabled: false } }, adminCookie);
  expectStatus(result.response.status, 200, "disable registration", result.body);
  result = await jsonRequest("/api/v1/auth/register", { method: "POST", body: { accountType: "personal", name: "Blocked User", email: `blocked-${runId}@example.test`, password, acceptedTerms: true } });
  expectStatus(result.response.status, 403, "registration API disabled", result.body);
  response = await request("/register");
  expectStatus(response.status, 200, "registration disabled page", await response.text());

  result = await jsonRequest("/api/v1/admin/auth-policy", { method: "PATCH", body: { passwordLoginEnabled: true, registrationEnabled: true } }, adminCookie);
  expectStatus(result.response.status, 200, "enable registration", result.body);

  const personalEmail = `personal-${runId}@example.test`;
  result = await jsonRequest("/api/v1/auth/register", { method: "POST", body: { accountType: "personal", name: "Personal User", email: personalEmail, password, acceptedTerms: true } });
  expectStatus(result.response.status, 201, "personal user registration", result.body);
  assert.equal(result.body.data.nextStep, "CREATE_API_KEY");
  let personalCookie = cookieFrom(result.response);
  result = await jsonRequest("/api/v1/auth/me", {}, personalCookie);
  expectStatus(result.response.status, 200, "personal user session", result.body);
  assert.equal(result.body.data.workspaces[0].status, "ACTIVE");

  result = await jsonRequest("/api/v1/auth/login", { method: "POST", body: { email: personalEmail, password, remember: false } });
  expectStatus(result.response.status, 200, "personal password login", result.body);
  personalCookie = cookieFrom(result.response);

  const enterpriseEmail = `enterprise-${runId}@example.test`;
  result = await jsonRequest("/api/v1/auth/register", { method: "POST", body: { accountType: "enterprise", name: "Enterprise Owner", companyName: "E2E Enterprise", email: enterpriseEmail, password, acceptedTerms: true } });
  expectStatus(result.response.status, 201, "enterprise user registration", result.body);
  assert.equal(result.body.data.nextStep, "VERIFY_ENTERPRISE");
  let enterpriseCookie = cookieFrom(result.response);
  result = await jsonRequest("/api/v1/auth/me", {}, enterpriseCookie);
  expectStatus(result.response.status, 200, "enterprise user session", result.body);
  assert.equal(result.body.data.workspaces[0].status, "PENDING");

  result = await jsonRequest("/api/v1/admin/auth-policy", {}, personalCookie);
  expectStatus(result.response.status, 403, "non-admin policy access denied", result.body);

  const staticSlug = `static-${runId}`;
  result = await jsonRequest(`/api/v1/admin/apis/routes/check?${new URLSearchParams({ host: new URL(apiUrl).hostname, path: `/${staticSlug}`, version: "v1", method: "GET", slug: staticSlug })}`, {}, adminCookie);
  expectStatus(result.response.status, 200, "route preflight available", result.body);
  assert.equal(result.body.data.available, true);

  const staticApi = await createApi(adminCookie, { sourceType: "STATIC_JSON", name: "Static JSON Smoke", slug: staticSlug, content: JSON.stringify({ ok: true, source: "static-json" }), billingMode: "PER_REQUEST", unitPrice: 0.25, dailyLimit: 1 });
  const textApi = await createApi(adminCookie, { sourceType: "RANDOM_TEXT", name: "Random Text Smoke", slug: `text-${runId}`, content: "alpha\nbeta" });
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nZcAAAAASUVORK5CYII=", "base64");
  const imageApi = await createApi(adminCookie, { sourceType: "RANDOM_IMAGE", name: "Random Image Smoke", slug: `image-${runId}` }, [{ name: "pixel.png", blob: new Blob([png], { type: "image/png" }) }]);
  const phpArchive = zipSync({ "index.php": strToU8("<?php header('Content-Type: application/json'); echo json_encode(['ok' => true, 'source' => 'php']);") });
  const phpApi = await createApi(adminCookie, { sourceType: "PHP_PACKAGE", name: "PHP Smoke", slug: `php-${runId}`, method: "ALL", entryFile: "index.php" }, [{ name: "smoke.zip", blob: new Blob([phpArchive], { type: "application/zip" }) }]);
  const builtinApi = await createApi(adminCookie, { sourceType: "BUILTIN", name: "UUID Smoke", slug: `uuid-${runId}`, internalHandler: "utility.uuid" });
  const localApi = await createApi(adminCookie, { sourceType: "SERVER_LOCAL", name: "Local Upstream Smoke", slug: `local-${runId}`, upstreamBaseUrl: `http://host.docker.internal:${localUpstreamPort}`, healthPath: "/health" });
  const externalApi = await createApi(adminCookie, { sourceType: "EXTERNAL", name: "External Upstream Smoke", slug: `external-${runId}`, publicPath: "/README.md", upstreamBaseUrl: "https://raw.githubusercontent.com/github/gitignore/main", healthPath: "/README.md" });
  const tunnelApi = await createApi(adminCookie, { sourceType: "TUNNEL", name: "Tunnel Upstream Smoke", slug: `tunnel-${runId}`, publicPath: "/LICENSE", upstreamBaseUrl: "https://raw.githubusercontent.com/github/gitignore/main", healthPath: "/LICENSE" });

  const quickForm = new FormData();
  quickForm.set("config", JSON.stringify({ sourceType: "STATIC_JSON", name: "快速接口", content: JSON.stringify({ ok: true, source: "quick-create" }) }));
  response = await request("/api/v1/admin/apis", { method: "POST", body: quickForm }, adminCookie);
  let quickBody = await response.json().catch(() => null);
  expectStatus(response.status, 201, "minimal quick API creation", quickBody);
  const quickApi = quickBody.data;
  assert.match(quickApi.slug, /^api-[a-z0-9]{6}(?:-\d+)?$/);
  assert.equal(quickApi.endpoint, `/api/${quickApi.slug}`);
  assert.equal(quickApi.publicHost, new URL(portalUrl).hostname);

  result = await jsonRequest(`/api/v1/admin/apis/routes/check?${new URLSearchParams({ host: staticApi.publicHost, path: staticApi.endpoint, version: "v1", method: "GET", slug: staticApi.slug })}`, {}, adminCookie);
  expectStatus(result.response.status, 200, "route preflight detects conflict", result.body);
  assert.equal(result.body.data.available, false);
  assert.equal(result.body.data.routeAvailable, false);

  result = await jsonRequest(`/api/v1/admin/apis/routes/check?${new URLSearchParams({ host: phpApi.publicHost, path: phpApi.endpoint, version: "v1", method: "GET", slug: `php-get-${runId}` })}`, {}, adminCookie);
  expectStatus(result.response.status, 200, "ALL method route conflict detection", result.body);
  assert.equal(result.body.data.routeAvailable, false);

  const duplicateRouteForm = new FormData();
  duplicateRouteForm.set("config", JSON.stringify({ sourceType: "STATIC_JSON", name: "Duplicate Route", slug: `duplicate-${runId}`, publicHost: staticApi.publicHost, publicPath: staticApi.endpoint, content: JSON.stringify({ duplicate: true }) }));
  response = await request("/api/v1/admin/apis", { method: "POST", body: duplicateRouteForm }, adminCookie);
  expectStatus(response.status, 409, "duplicate route rejected on creation", await response.text());

  const privateForm = new FormData();
  privateForm.set("config", JSON.stringify({ sourceType: "EXTERNAL", name: "Blocked Private Upstream", slug: `blocked-upstream-${runId}`, publicHost: new URL(apiUrl).hostname, publicPath: `/blocked-upstream-${runId}`, upstreamBaseUrl: "http://127.0.0.1:8080" }));
  response = await request("/api/v1/admin/apis", { method: "POST", body: privateForm }, adminCookie);
  expectStatus(response.status, 400, "block private external upstream on creation", await response.text());

  for (const product of [staticApi, textApi, imageApi, phpApi, builtinApi, localApi, externalApi, tunnelApi, quickApi]) await publishApi(adminCookie, product);

  result = await jsonRequest("/api/v1/apps", { method: "POST", body: { name: "Admin API Test App", environment: "TEST" } }, adminCookie);
  expectStatus(result.response.status, 201, "administrator creates test application and API key", result.body);
  const adminAppId = result.body.data.app.id;
  const adminApiKey = result.body.data.secret;
  assert.match(adminApiKey, /^sk_test_/);
  await subscribe(adminCookie, adminAppId, quickApi.id, `admin-${quickApi.slug}`);
  response = await request(quickApi.endpoint, { headers: { Authorization: `Bearer ${adminApiKey}` } });
  expectStatus(response.status, 200, "administrator API key gateway call", await response.text());

  response = await request("/docs");
  const docsHtml = await response.text();
  expectStatus(response.status, 200, "documentation uses public gateway URL", docsHtml);
  assert.ok(docsHtml.includes(`${portalUrl}/api/`), "documentation must use the platform domain and /api prefix for default routes");
  assert.ok(!docsHtml.includes("/api/v1/gateway/"), "documentation must not add a legacy API prefix");

  response = await request(`/apis/${staticSlug}`);
  const detailHtml = await response.text();
  expectStatus(response.status, 200, "API detail uses direct public route", detailHtml);
  assert.ok(detailHtml.includes(`${apiUrl}/${staticSlug}`), "API detail must use the gateway domain plus public path");
  assert.ok(!detailHtml.includes("/api/v1/gateway/"), "API detail must not add a legacy API prefix");

  result = await jsonRequest("/api/v1/apps", { method: "POST", body: { name: "E2E Test App", environment: "TEST" } }, personalCookie);
  expectStatus(result.response.status, 201, "create application and API key", result.body);
  const appId = result.body.data.app.id;
  const apiKey = result.body.data.secret;
  assert.match(apiKey, /^sk_test_/);

  let latestSubscriptionResult;
  for (const product of [staticApi, textApi, imageApi, phpApi, builtinApi, localApi, externalApi, tunnelApi, quickApi]) latestSubscriptionResult = await subscribe(personalCookie, appId, product.id, product.slug);

  const quickSubscription = latestSubscriptionResult.data.subscriptions.find((item) => item.productId === quickApi.id);
  assert.ok(quickSubscription, "quick API subscription must exist before cancellation");
  result = await jsonRequest(`/api/v1/subscriptions?id=${encodeURIComponent(quickSubscription.id)}`, { method: "DELETE" }, personalCookie);
  expectStatus(result.response.status, 200, "cancel API subscription", result.body);
  assert.equal(result.body.data.subscriptions.find((item) => item.id === quickSubscription.id)?.status, "CANCELED");
  result = await jsonRequest("/api/v1/subscriptions", { method: "POST", body: { appId, productId: quickApi.id } }, personalCookie);
  expectStatus(result.response.status, 201, "resubscribe canceled API", result.body);
  assert.equal(result.body.data.subscriptions.find((item) => item.id === quickSubscription.id)?.status, "ACTIVE");

  result = await jsonRequest("/api/v1/admin/apis/statistics", {}, adminCookie);
  expectStatus(result.response.status, 200, "statistics before gateway calls", result.body);
  const callsBefore = result.body.data.totalCalls;

  response = await request(`/${staticApi.slug}`, { headers: { Authorization: `Bearer ${apiKey}` } }, "", apiUrl);
  expectStatus(response.status, 200, "gateway static JSON call", await response.text());
  assert.equal(response.headers.get("x-request-cost"), "0.25");
  assert.equal(response.headers.get("x-billable-units"), "1");
  response = await request(`/${staticApi.slug}`, { headers: { Authorization: `Bearer ${apiKey}` } }, "", apiUrl);
  expectStatus(response.status, 429, "gateway daily limit enforcement", await response.text());
  response = await request(`/${textApi.slug}`, { headers: { Authorization: `Bearer ${apiKey}` } }, "", apiUrl);
  expectStatus(response.status, 200, "gateway random text call", await response.text());
  response = await request(`/${imageApi.slug}`, { headers: { Authorization: `Bearer ${apiKey}` } }, "", apiUrl);
  expectStatus(response.status, 200, "gateway random image call", await response.text());
  assert.match(response.headers.get("content-type") ?? "", /^image\//);
  response = await request(`/${phpApi.slug}`, { headers: { Authorization: `Bearer ${apiKey}` } }, "", apiUrl);
  expectStatus(response.status, 200, "isolated PHP gateway call", await response.text());
  response = await request(`/${builtinApi.slug}`, { headers: { Authorization: `Bearer ${apiKey}` } }, "", apiUrl);
  expectStatus(response.status, 200, "built-in API gateway call", await response.text());
  response = await request(`/${localApi.slug}`, { headers: { Authorization: `Bearer ${apiKey}` } }, "", apiUrl);
  expectStatus(response.status, 200, "server-local gateway call", await response.text());
  response = await request("/README.md", { headers: { Authorization: `Bearer ${apiKey}` } }, "", apiUrl);
  expectStatus(response.status, 200, "external upstream gateway call", await response.text());
  response = await request("/LICENSE", { headers: { Authorization: `Bearer ${apiKey}` } }, "", apiUrl);
  expectStatus(response.status, 200, "tunnel upstream gateway call", await response.text());
  response = await request(quickApi.endpoint, { headers: { Authorization: `Bearer ${apiKey}` } });
  expectStatus(response.status, 200, "quick-created API gateway call", await response.text());
  response = await request(`/${textApi.slug}`, { headers: { Authorization: "Bearer invalid-key" } }, "", apiUrl);
  expectStatus(response.status, 401, "invalid API key rejected", await response.text());

  result = await jsonRequest("/api/v1/admin/apis/statistics", {}, adminCookie);
  expectStatus(result.response.status, 200, "statistics after gateway calls", result.body);
  assert.ok(result.body.data.totalCalls >= callsBefore + 9, "successful gateway calls must increase total statistics");
  assert.ok(result.body.data.todayCalls >= callsBefore + 9, "successful gateway calls must increase today's statistics");
  assert.ok(result.body.data.daily.reduce((sum, point) => sum + point.success + point.failed, 0) >= 9, "seven-day series must contain gateway calls");

  const removableApi = await createApi(adminCookie, { sourceType: "STATIC_JSON", name: "Removable API Smoke", slug: `removable-${runId}`, content: JSON.stringify({ removable: true }) });
  await publishApi(adminCookie, removableApi);
  await subscribe(adminCookie, adminAppId, removableApi.id, removableApi.slug);
  response = await request(`/api/v1/admin/apis?id=${encodeURIComponent(removableApi.id)}`, { method: "DELETE" }, adminCookie);
  expectStatus(response.status, 409, "published subscribed API cannot be deleted", await response.text());
  result = await jsonRequest("/api/v1/admin/apis", { method: "PATCH", body: { id: removableApi.id, status: "OFFLINE" } }, adminCookie);
  expectStatus(result.response.status, 200, "subscribed API can be taken offline", result.body);
  response = await request(`/api/v1/admin/apis?id=${encodeURIComponent(removableApi.id)}`, { method: "DELETE" }, adminCookie);
  expectStatus(response.status, 200, "offline API deletion cancels subscriptions", await response.text());
  response = await request(`/apis/${removableApi.slug}`);
  expectStatus(response.status, 404, "deleted API is removed from catalog", await response.text());

  const providerApi = await createApi(enterpriseCookie, { sourceType: "STATIC_JSON", name: "Provider Review Smoke", slug: `provider-${runId}`, content: JSON.stringify({ provider: true }) });
  result = await jsonRequest("/api/v1/admin/apis", { method: "PATCH", body: { id: providerApi.id, status: "REVIEW" } }, enterpriseCookie);
  expectStatus(result.response.status, 200, "provider submits API for review", result.body);
  result = await jsonRequest("/api/v1/admin/apis", { method: "PATCH", body: { id: providerApi.id, status: "PUBLISHED" } }, adminCookie);
  expectStatus(result.response.status, 200, "administrator approves provider API", result.body);

  result = await jsonRequest("/api/v1/admin/integrations", { method: "PATCH", body: { key: "github", enabled: false, publicConfig: { clientId: "e2e-client-id" }, secrets: {}, secretAction: "remove" } }, adminCookie);
  expectStatus(result.response.status, 200, "disable GitHub configuration", result.body);

  console.log(`E2E smoke passed: ${results.length} verified operations.`);
  for (const item of results) console.log(`- ${item}`);
}

await new Promise((resolve, reject) => localServer.listen(localUpstreamPort, "127.0.0.1", resolve).once("error", reject));
try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await new Promise((resolve) => localServer.close(resolve));
}
