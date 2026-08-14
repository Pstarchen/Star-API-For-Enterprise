import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { zipSync, strToU8 } from "fflate";

const portalUrl = requiredEnv("E2E_PORTAL_URL").replace(/\/$/, "");
const installToken = requiredEnv("E2E_INSTALL_TOKEN");
const runId = Date.now().toString(36);
const password = `Smoke-${runId}-Pass9`;
const results = [];
let defaultCategoryId = "";
const installIcon = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nZcAAAAASUVORK5CYII=", "base64");
const replacementIcon = Buffer.concat([installIcon, Buffer.from("replacement")]);
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

async function request(path, options = {}, cookie = "") {
  const headers = new Headers(options.headers);
  if (cookie) headers.set("Cookie", cookie);
  return fetch(`${portalUrl}${path}`, { ...options, headers, redirect: options.redirect ?? "manual" });
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
  results.push(label);
  console.log(`PASS ${label}`);
}

function pageIconHrefs(html) {
  return [...html.matchAll(/<link\b[^>]*\brel=["']icon["'][^>]*>/gi)]
    .map(([tag]) => tag.match(/\bhref=["']([^"']+)["']/i)?.[1])
    .filter(Boolean);
}

async function createApi(cookie, config, assets = []) {
  const form = new FormData();
  form.set("config", JSON.stringify({
    categoryId: config.categoryId ?? defaultCategoryId,
    color: "#586be8",
    tags: ["e2e"],
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

async function importOpenApi(cookie, config, document, expectedStatus = 201) {
  const form = new FormData();
  form.set("config", JSON.stringify({
    categoryId: config.categoryId ?? defaultCategoryId,
    publicHost: new URL(portalUrl).hostname,
    publicPrefix: `/api/${config.slug}`,
    upstreamOverride: "",
    visibility: "PUBLIC",
    billingMode: "FREE",
    unitPrice: 0,
    defaultQpsLimit: 20,
    ...config,
  }));
  form.set("document", new File([document], config.fileName ?? "openapi.yaml", { type: "application/yaml" }));
  const response = await request("/api/v1/admin/apis/import", { method: "POST", body: form }, cookie);
  const body = await response.json().catch(() => null);
  expectStatus(response.status, expectedStatus, `${expectedStatus === 201 ? "import" : "reject"} OpenAPI document`, body);
  return body;
}

async function uploadMedia(cookie, productId, name, bytes, type, expectedStatus = 201) {
  const response = await request(`/api/v1/admin/apis/media?productId=${encodeURIComponent(productId)}`, {
    method: "POST",
    headers: { "Content-Type": type, "X-File-Name": encodeURIComponent(name) },
    body: new Blob([bytes], { type }),
  }, cookie);
  const body = await response.json().catch(() => null);
  expectStatus(response.status, expectedStatus, `${expectedStatus >= 400 ? "reject" : "upload"} media ${name}`, body);
  return body;
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
    iconDataUrl: `data:image/png;base64,${installIcon.toString("base64")}`,
    adminName: "Smoke Admin",
    adminEmail,
    adminPassword: password,
  } });
  expectStatus(result.response.status, 201, "first installation", result.body);
  const adminCookie = cookieFrom(result.response);
  assert.ok(adminCookie, "installer must create an administrator session");

  response = await request("/");
  const installedPageHtml = await response.text();
  expectStatus(response.status, 200, "installed platform page", installedPageHtml);
  const installedIconHrefs = pageIconHrefs(installedPageHtml);
  assert.equal(installedIconHrefs.length, 1, "the page must declare exactly one favicon");
  assert.match(installedIconHrefs[0], /^\/api\/v1\/branding\/icon\?v=/, "the favicon must use the installed website icon");
  response = await request(installedIconHrefs[0]);
  const installedIconBytes = Buffer.from(await response.arrayBuffer());
  expectStatus(response.status, 200, "installed website icon", installedIconBytes.length);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.deepEqual(installedIconBytes, installIcon);

  result = await jsonRequest("/api/v1/auth/me", {}, adminCookie);
  expectStatus(result.response.status, 200, "administrator session", result.body);
  assert.equal(result.body.data.platformRole, "ADMIN");

  result = await jsonRequest("/api/v1/admin/api-categories", {}, adminCookie);
  expectStatus(result.response.status, 200, "list API categories", result.body);
  defaultCategoryId = result.body.data.find((category) => category.name === "其他")?.id ?? "";
  assert.ok(defaultCategoryId, "default API category must exist after migration");

  result = await jsonRequest("/api/v1/admin/api-categories", { method: "POST", body: { name: `Smoke Category ${runId}`, description: "Temporary category for CRUD verification", sortOrder: 88, enabled: true } }, adminCookie);
  expectStatus(result.response.status, 201, "create API category", result.body);
  const temporaryCategory = result.body.data;
  result = await jsonRequest("/api/v1/admin/api-categories", { method: "PATCH", body: { id: temporaryCategory.id, name: `Smoke Renamed ${runId}`, description: "Updated category", sortOrder: 89, enabled: false } }, adminCookie);
  expectStatus(result.response.status, 200, "update API category", result.body);
  assert.equal(result.body.data.find((category) => category.id === temporaryCategory.id)?.enabled, false);
  response = await request(`/api/v1/admin/api-categories?id=${encodeURIComponent(temporaryCategory.id)}`, { method: "DELETE" }, adminCookie);
  expectStatus(response.status, 200, "delete unused API category", await response.json());

  const heroDataUrl = `data:image/jpeg;base64,${readFileSync(new URL("../public/art/anime-operator.jpg", import.meta.url)).toString("base64")}`;
  result = await jsonRequest("/api/v1/admin/settings", { method: "PATCH", body: { name: "Star-API E2E", description: "Automated end-to-end verification environment.", publicUrl: portalUrl, icpNumber: "Test ICP 2026", publicSecurityNumber: "Test Public Security 42000000000001", iconAction: "replace", iconDataUrl: `data:image/png;base64,${replacementIcon.toString("base64")}`, heroAction: "replace", heroDataUrl } }, adminCookie);
  expectStatus(result.response.status, 200, "update hero and filing settings", result.body);
  assert.equal(result.body.data.hasCustomHero, true);
  assert.equal(result.body.data.hasCustomIcon, true);
  response = await request("/");
  const replacedIconHrefs = pageIconHrefs(await response.text());
  assert.equal(replacedIconHrefs.length, 1, "the page must keep a single favicon after a settings update");
  assert.notEqual(replacedIconHrefs[0], installedIconHrefs[0], "the favicon URL revision must change after replacement");
  response = await request(replacedIconHrefs[0]);
  const replacedIconBytes = Buffer.from(await response.arrayBuffer());
  expectStatus(response.status, 200, "replaced website icon", replacedIconBytes.length);
  assert.deepEqual(replacedIconBytes, replacementIcon);
  response = await request("/api/v1/branding/hero");
  expectStatus(response.status, 200, "custom hero asset", await response.arrayBuffer());
  assert.equal(response.headers.get("content-type"), "image/jpeg");

  response = await request("/api/v1/payments/alipay/notify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `payload=${"x".repeat(1024 * 1024)}`,
  });
  expectStatus(response.status, 413, "oversized public payment callback rejected before parsing", await response.text());

  for (const page of ["/admin", "/admin/apis", "/admin/subscriptions", "/admin/testing", "/admin/providers", "/admin/users", "/admin/settings", "/admin/settings/auth", "/admin/settings/integrations", "/admin/settings/payments", "/admin/monitor", "/admin/audits"]) {
    response = await request(page, {}, adminCookie);
    expectStatus(response.status, 200, `administrator page ${page}`, await response.text());
  }

  result = await jsonRequest("/api/v1/admin/auth-policy", {}, adminCookie);
  expectStatus(result.response.status, 200, "read authentication policy", result.body);
  assert.deepEqual(result.body.data, { passwordLoginEnabled: true, registrationEnabled: true, registrationEmailVerificationRequired: false });

  response = await request("/api/v1/auth/oauth/github");
  expectStatus(response.status, 302, "GitHub disabled redirect", await response.text());
  assert.match(response.headers.get("location") ?? "", /github_not_configured/);

  response = await request("/api/v1/auth/oauth/github/callback");
  expectStatus(response.status, 302, "GitHub invalid callback redirect", await response.text());
  assert.match(response.headers.get("location") ?? "", /github_invalid_callback/);

  result = await jsonRequest("/api/v1/admin/integrations", { method: "PATCH", body: {
    key: "github",
    enabled: true,
    publicConfig: { clientId: "e2e-client-id" },
    secrets: { clientSecret: "e2e-client-secret" },
    secretAction: "replace",
  } }, adminCookie);
  expectStatus(result.response.status, 200, "enable GitHub configuration", result.body);

  response = await request("/api/v1/auth/oauth/github");
  expectStatus(response.status, 302, "GitHub enabled authorization redirect", await response.text());
  const githubLocation = response.headers.get("location") ?? "";
  assert.equal(new URL(githubLocation).hostname, "github.com");
  assert.ok(new URL(githubLocation).searchParams.get("state"), "GitHub authorization must include state");
  assert.equal(new URL(githubLocation).searchParams.get("scope"), "read:user user:email");
  assert.equal(new URL(githubLocation).searchParams.get("redirect_uri"), `${portalUrl}/api/v1/auth/oauth/github/callback`);

  response = await request("/auth/oauth/callback?next=/admin/settings/integrations", {}, adminCookie);
  expectStatus(response.status, 200, "OAuth frontend completion page", await response.text());

  result = await jsonRequest("/api/v1/admin/auth-policy", { method: "PATCH", body: { passwordLoginEnabled: false, registrationEnabled: false, registrationEmailVerificationRequired: false } }, adminCookie);
  expectStatus(result.response.status, 409, "prevent administrator login lockout", result.body);

  result = await jsonRequest("/api/v1/admin/auth-policy", { method: "PATCH", body: { passwordLoginEnabled: true, registrationEnabled: false, registrationEmailVerificationRequired: false } }, adminCookie);
  expectStatus(result.response.status, 200, "disable registration", result.body);
  result = await jsonRequest("/api/v1/auth/register", { method: "POST", body: { accountType: "personal", name: "Blocked User", email: `blocked-${runId}@example.test`, password, acceptedTerms: true } });
  expectStatus(result.response.status, 403, "registration API disabled", result.body);
  response = await request("/register");
  expectStatus(response.status, 200, "registration disabled page", await response.text());

  result = await jsonRequest("/api/v1/admin/auth-policy", { method: "PATCH", body: { passwordLoginEnabled: true, registrationEnabled: true, registrationEmailVerificationRequired: false } }, adminCookie);
  expectStatus(result.response.status, 200, "enable registration", result.body);

  const personalEmail = `personal-${runId}@example.test`;
  result = await jsonRequest("/api/v1/auth/register", { method: "POST", body: { accountType: "personal", name: "Personal User", email: personalEmail, password, acceptedTerms: true } });
  expectStatus(result.response.status, 201, "personal user registration", result.body);
  assert.equal(result.body.data.nextStep, "CREATE_API_KEY");
  let personalCookie = cookieFrom(result.response);
  result = await jsonRequest("/api/v1/auth/me", {}, personalCookie);
  expectStatus(result.response.status, 200, "personal user session", result.body);
  assert.equal(result.body.data.workspaces[0].status, "ACTIVE");
  const personalTenantId = result.body.data.workspaces[0].id;

  result = await jsonRequest("/api/v1/auth/login", { method: "POST", body: { email: personalEmail, password, remember: false } });
  expectStatus(result.response.status, 200, "personal password login", result.body);
  personalCookie = cookieFrom(result.response);

  result = await jsonRequest("/api/v1/tenant/settings", { method: "PATCH", body: { name: "Personal User", creditCode: null, notificationEmail: "", timezone: "Asia/Shanghai", quotaAlerts: false, balanceAlerts: false } }, personalCookie);
  expectStatus(result.response.status, 200, "personal workspace settings accept an absent credit code", result.body);
  assert.equal(result.body.data.creditCode, null);

  const enterpriseEmail = `enterprise-${runId}@example.test`;
  result = await jsonRequest("/api/v1/auth/register", { method: "POST", body: { accountType: "enterprise", name: "Enterprise Owner", companyName: "E2E Enterprise", email: enterpriseEmail, password, acceptedTerms: true } });
  expectStatus(result.response.status, 201, "enterprise user registration", result.body);
  assert.equal(result.body.data.nextStep, "VERIFY_ENTERPRISE");
  let enterpriseCookie = cookieFrom(result.response);
  result = await jsonRequest("/api/v1/auth/me", {}, enterpriseCookie);
  expectStatus(result.response.status, 200, "enterprise user session", result.body);
  assert.equal(result.body.data.workspaces[0].status, "PENDING");

  result = await jsonRequest("/api/v1/tenant/settings", { method: "PATCH", body: { name: "E2E Enterprise", creditCode: "", notificationEmail: "", timezone: "Asia/Shanghai", quotaAlerts: true, balanceAlerts: true } }, enterpriseCookie);
  expectStatus(result.response.status, 200, "enterprise workspace settings accept optional fields", result.body);
  assert.equal(result.body.data.notificationEmail, null);

  result = await jsonRequest("/api/v1/admin/auth-policy", {}, personalCookie);
  expectStatus(result.response.status, 403, "non-admin policy access denied", result.body);

  const staticSlug = `static-${runId}`;
  result = await jsonRequest(`/api/v1/admin/apis/routes/check?${new URLSearchParams({ host: new URL(portalUrl).hostname, path: `/api/${staticSlug}`, version: "v1", methods: "GET", slug: staticSlug })}`, {}, adminCookie);
  expectStatus(result.response.status, 200, "route preflight available", result.body);
  assert.equal(result.body.data.available, true);

  const staticApi = await createApi(adminCookie, { sourceType: "STATIC_JSON", name: "Static JSON Smoke", slug: staticSlug, content: JSON.stringify({ ok: true, source: "static-json" }), billingMode: "PER_REQUEST", unitPrice: 0.25, dailyLimit: 1 });
  const paidDirectApi = await createApi(adminCookie, { sourceType: "STATIC_JSON", name: "Paid Direct Link Smoke", slug: `paid-direct-${runId}`, content: JSON.stringify({ ok: true, source: "paid-direct-link" }), billingMode: "PER_REQUEST", unitPrice: 0.4, dailyLimit: 0 });
  const textApi = await createApi(adminCookie, { sourceType: "RANDOM_TEXT", name: "Random Text Smoke", slug: `text-${runId}`, content: "alpha\nbeta" });
  const datasetApi = await createApi(adminCookie, {
    sourceType: "DATASET",
    name: "Classified Dataset Smoke",
    slug: `dataset-${runId}`,
    methods: ["GET", "POST"],
    responseFormats: ["TXT", "JSON"],
    parameters: [
      { location: "QUERY", name: "name", upstreamName: "", required: true, dataType: "string", defaultValue: "", description: "Dataset category or menu", pattern: "", sensitive: false },
      { location: "QUERY", name: "type", upstreamName: "", required: false, dataType: "string", defaultValue: "txt", description: "txt or json", pattern: "^(txt|json)$", sensitive: false },
    ],
    responseParameters: [{ name: "content", dataType: "string", description: "Selected dataset content" }],
    dataset: { grouping: "FILE", categoryParameter: "name", formatParameter: "type", menuValue: "menu", defaultFormat: "TXT", textField: "content", itemsPath: "" },
  }, [
    { name: "quotes.json", blob: new Blob([JSON.stringify([{ content: "quote-alpha", source: "json" }, { content: "quote-beta", source: "json" }])], { type: "application/json" }) },
    { name: "notices.txt", blob: new Blob(["notice-one\nnotice-two"], { type: "text/plain" }) },
  ]);
  const mergedDatasetApi = await createApi(adminCookie, {
    sourceType: "DATASET",
    name: "Merged Structured Data Smoke",
    slug: `merged-data-${runId}`,
    responseFormats: ["TXT", "JSON"],
    parameters: [
      { location: "QUERY", name: "region", upstreamName: "metadata.region", required: false, dataType: "string", defaultValue: "", description: "Filter any nested JSON field", pattern: "", sensitive: false },
      { location: "QUERY", name: "output", upstreamName: "", required: false, dataType: "string", defaultValue: "json", description: "txt or json", pattern: "^(txt|json)$", sensitive: false },
    ],
    responseParameters: [{ name: "body", dataType: "string", description: "Selected record" }],
    dataset: { grouping: "MERGED", categoryParameter: "", formatParameter: "output", menuValue: "", defaultFormat: "JSON", textField: "body", itemsPath: "payload.records" },
  }, [
    { name: "chapter-one.json", blob: new Blob([JSON.stringify({ payload: { records: [{ body: "north-entry", metadata: { region: "north" } }, { body: "south-entry", metadata: { region: "south" } }] } })], { type: "application/json" }) },
    { name: "unrelated-name.txt", blob: new Blob(["plain-entry-one\nplain-entry-two"], { type: "text/plain" }) },
  ]);
  const genericDatasetApi = await createApi(adminCookie, {
    sourceType: "DATASET",
    name: "Generic Dataset Smoke",
    slug: `generic-data-${runId}`,
    methods: undefined,
    responseFormats: ["TXT", "JSON"],
  }, [
    { name: "inventory-2026.json", blob: new Blob([JSON.stringify({ labels: ["warehouse", "published"], envelope: { entries: [{ headline: "generic-alpha", metadata: { source: "fixture" } }, { headline: "generic-beta", metadata: { source: "fixture" } }] } })], { type: "application/json" }) },
  ]);
  assert.deepEqual(genericDatasetApi.methods, ["GET", "POST"], "dataset import without a method override must support GET and POST");
  assert.equal(genericDatasetApi.responseExample.headline, "generic-alpha", "dataset example must come from the detected record collection");
  assert.ok(genericDatasetApi.requestParameters.some((parameter) => parameter.name === "headline" && parameter.upstreamName === "headline" && parameter.dataType === "string"), "dataset import must infer a filter from a top-level field");
  assert.ok(genericDatasetApi.requestParameters.some((parameter) => parameter.name === "source" && parameter.upstreamName === "metadata.source" && parameter.dataType === "string"), "dataset import must infer a filter from a nested field");
  assert.ok(genericDatasetApi.responseParameters.some((parameter) => parameter.name === "headline" && parameter.dataType === "string"), "dataset import must infer response fields from real records");
  assert.ok(genericDatasetApi.responseParameters.some((parameter) => parameter.name === "metadata" && parameter.dataType === "object"), "dataset import must retain nested response object types");
  result = await jsonRequest(`/api/v1/admin/apis/config?id=${encodeURIComponent(genericDatasetApi.id)}`, {}, adminCookie);
  expectStatus(result.response.status, 200, "read generic dataset configuration", result.body);
  const genericDatasetConfig = result.body.data;
  result = await jsonRequest("/api/v1/admin/apis/config", { method: "PATCH", body: {
    id: genericDatasetConfig.id,
    name: "Generic Dataset Smoke Updated",
    shortName: "Data",
    description: "Updated through the complete API configuration editor.",
    color: "#4f46e5",
    tags: ["e2e", "updated"],
    featured: true,
    sla: "99.95",
    categoryId: genericDatasetConfig.categoryId,
    visibility: genericDatasetConfig.visibility,
    billingMode: genericDatasetConfig.billingMode,
    unitPrice: genericDatasetConfig.unitPrice,
    freeQuotaMonthly: genericDatasetConfig.freeQuotaMonthly,
    defaultQpsLimit: genericDatasetConfig.defaultQpsLimit,
    route: { ...genericDatasetConfig.route, methods: ["GET", "POST"], summary: "Updated generic dataset summary" },
    upstream: { rewriteMode: genericDatasetConfig.upstream.rewriteMode, upstreamPrefix: genericDatasetConfig.upstream.upstreamPrefix, healthPath: genericDatasetConfig.upstream.healthPath, timeoutMs: genericDatasetConfig.upstream.timeoutMs, authType: genericDatasetConfig.upstream.authType, preserveSecret: genericDatasetConfig.upstream.secretConfigured, token: "", headerName: "", headerValue: "", nodes: genericDatasetConfig.upstream.nodes.map(({ id, name, baseUrl, weight, enabled }) => ({ id, name, baseUrl, weight, enabled })) },
    parameters: genericDatasetConfig.parameters.map(({ location, name, upstreamName, required, dataType, defaultValue, description, pattern, sensitive }) => ({ location, name, upstreamName, required, dataType, defaultValue, description, pattern, sensitive })),
    responseParameters: [{ name: "headline", dataType: "string", description: "Selected record headline" }],
    dataset: { ...genericDatasetConfig.dataset, itemsPath: "envelope.entries", textField: "headline" },
  } }, adminCookie);
  expectStatus(result.response.status, 200, "update a generic dataset contract", result.body);
  assert.equal(result.body.data.name, "Generic Dataset Smoke Updated", "API basic metadata must be editable after creation");
  assert.deepEqual(result.body.data.methods, ["GET", "POST"], "GET and POST must remain editable together");
  assert.equal(result.body.data.responseExample.headline, "generic-alpha", "contract edits must preserve an example derived from current data");
  const scalarDatasetApi = await createApi(adminCookie, {
    sourceType: "DATASET",
    name: "Scalar Dataset Smoke",
    slug: `scalar-data-${runId}`,
    responseFormats: ["TXT", "JSON"],
  }, [
    { name: "numbers.json", blob: new Blob([JSON.stringify([7, 11, 13])], { type: "application/json" }) },
  ]);
  assert.deepEqual(scalarDatasetApi.responseParameters.map(({ name, dataType }) => ({ name, dataType })), [{ name: "value", dataType: "integer" }], "scalar datasets must receive a generic inferred response contract");
  const objectMapDatasetApi = await createApi(adminCookie, {
    sourceType: "DATASET",
    name: "Object Map Dataset Smoke",
    slug: `object-map-${runId}`,
    responseFormats: ["TXT", "JSON"],
  }, [
    { name: "arbitrary-record-map.json", blob: new Blob([`\uFEFF${JSON.stringify({ first_record: { label: "Mapped alpha", enabled: true }, second_record: { label: "Mapped beta", enabled: false } })}`], { type: "application/json" }) },
  ]);
  assert.ok(objectMapDatasetApi.requestParameters.some((parameter) => parameter.upstreamName === "label"), "object-map datasets must infer fields without depending on record keys or file names");
  assert.deepEqual(objectMapDatasetApi.responseExample, { label: "Mapped alpha", enabled: true }, "UTF-8 BOM and object-map records must generate a real example");
  const portableDatasetApi = await createApi(adminCookie, {
    sourceType: "DATASET",
    name: "Portable File Dataset Smoke",
    slug: `portable-data-${runId}`,
    methods: ["GET", "POST"],
    responseFormats: ["TXT", "JSON"],
    parameters: [
      { location: "QUERY", name: "region", upstreamName: "region", required: false, dataType: "string", defaultValue: "", description: "Filter records imported from any supported file format", pattern: "", sensitive: false },
      { location: "BODY", name: "recordId", upstreamName: "id", required: false, dataType: "integer", defaultValue: "", description: "Filter a record using a JSON request body", pattern: "", sensitive: false },
    ],
    responseParameters: [
      { name: "id", dataType: "integer", description: "Source record ID" },
      { name: "message", dataType: "string", description: "Source record content" },
    ],
    dataset: { grouping: "MERGED", categoryParameter: "", formatParameter: "", menuValue: "", defaultFormat: "JSON", textField: "message", itemsPath: "" },
  }, [
    { name: "records.csv", blob: new Blob(['id,region,message\n101,north,"CSV value, with comma"'], { type: "text/csv" }) },
    { name: "records.yaml", blob: new Blob(["- id: 202\n  region: south\n  message: YAML value\n"], { type: "application/yaml" }) },
    { name: "records.jsonl", blob: new Blob(['{"id":303,"region":"east","message":"JSONL value"}\n{"id":304,"region":"west","message":"JSONL second value"}'], { type: "application/x-ndjson" }) },
    { name: "records.tsv", blob: new Blob(["id\tregion\tmessage\n404\tcentral\tTSV value"], { type: "text/tab-separated-values" }) },
  ]);
  assert.deepEqual(portableDatasetApi.responseExample, { id: "101", region: "north", message: "CSV value, with comma" }, "CSV must generate a real response example with quoted values intact");
  const sniffedDatasetApi = await createApi(adminCookie, {
    sourceType: "DATASET",
    name: "Content Sniffed Dataset Smoke",
    slug: `sniffed-data-${runId}`,
    responseFormats: ["TXT", "JSON"],
    dataset: { grouping: "MERGED", categoryParameter: "", formatParameter: "", menuValue: "", defaultFormat: "JSON", textField: "message", itemsPath: "" },
  }, [
    { name: "release.payload", blob: new Blob([JSON.stringify([{ code: "unknown-extension", message: "Detected by content" }])], { type: "application/octet-stream" }) },
  ]);
  assert.deepEqual(sniffedDatasetApi.responseExample, { code: "unknown-extension", message: "Detected by content" }, "unknown text extensions must be parsed from their real content");
  assert.ok(sniffedDatasetApi.requestParameters.some((parameter) => parameter.upstreamName === "code"), "content-sniffed datasets must receive inferred filters");
  const zippedDatasetArchive = zipSync({
    "north/inventory.data": strToU8("sku,region,message\nN-1,north,North archive row"),
    "south/catalog.json": strToU8(JSON.stringify([{ sku: "S-2", region: "south", message: "South archive row" }])),
    "__MACOSX/._catalog.json": strToU8("ignored metadata"),
  });
  const zippedDatasetApi = await createApi(adminCookie, {
    sourceType: "DATASET",
    name: "ZIP Dataset Smoke",
    slug: `zip-data-${runId}`,
    methods: ["GET", "POST"],
    responseFormats: ["TXT", "JSON"],
    parameters: [
      { location: "QUERY", name: "category", upstreamName: "", required: false, dataType: "string", defaultValue: "", description: "Archive directory and file group", pattern: "", sensitive: false },
      { location: "QUERY", name: "region", upstreamName: "region", required: false, dataType: "string", defaultValue: "", description: "Filter an archive record", pattern: "", sensitive: false },
      { location: "BODY", name: "sku", upstreamName: "sku", required: false, dataType: "string", defaultValue: "", description: "Filter through a JSON request body", pattern: "", sensitive: false },
      { location: "QUERY", name: "format", upstreamName: "", required: false, dataType: "string", defaultValue: "json", description: "txt or json", pattern: "^(txt|json)$", sensitive: false },
    ],
    responseParameters: [
      { name: "sku", dataType: "string", description: "Imported record key" },
      { name: "region", dataType: "string", description: "Imported record region" },
      { name: "message", dataType: "string", description: "Imported record body" },
    ],
    dataset: { grouping: "FILE", categoryParameter: "category", formatParameter: "format", menuValue: "list", defaultFormat: "JSON", textField: "message", itemsPath: "" },
  }, [
    { name: "portable-content.zip", blob: new Blob([zippedDatasetArchive], { type: "application/zip" }) },
  ]);
  assert.deepEqual(zippedDatasetApi.responseExample, { sku: "N-1", region: "north", message: "North archive row" }, "ZIP datasets must parse mixed formats without business-specific names");
  const binaryDatasetForm = new FormData();
  binaryDatasetForm.set("config", JSON.stringify({ sourceType: "DATASET", categoryId: defaultCategoryId, name: "Binary Dataset", slug: `binary-data-${runId}`, publicHost: new URL(portalUrl).hostname, publicPath: `/api/binary-data-${runId}` }));
  binaryDatasetForm.append("assets", new Blob([new Uint8Array([0, 1, 2, 3])], { type: "application/octet-stream" }), "binary.payload");
  response = await request("/api/v1/admin/apis", { method: "POST", body: binaryDatasetForm }, adminCookie);
  const binaryDatasetBody = await response.json();
  expectStatus(response.status, 400, "reject binary files from generic dataset import", binaryDatasetBody);
  assert.match(binaryDatasetBody.message, /二进制|控制字符/);
  const invalidJsonlForm = new FormData();
  invalidJsonlForm.set("config", JSON.stringify({ sourceType: "DATASET", categoryId: defaultCategoryId, name: "Invalid JSONL", slug: `invalid-jsonl-${runId}`, publicHost: new URL(portalUrl).hostname, publicPath: `/api/invalid-jsonl-${runId}` }));
  invalidJsonlForm.append("assets", new Blob(['{"ok":true}\nnot-json'], { type: "application/x-ndjson" }), "invalid.jsonl");
  response = await request("/api/v1/admin/apis", { method: "POST", body: invalidJsonlForm }, adminCookie);
  const invalidJsonlBody = await response.json();
  expectStatus(response.status, 400, "reject invalid JSONL with line number", invalidJsonlBody);
  assert.match(invalidJsonlBody.message, /第 2 行/);
  assert.equal(scalarDatasetApi.responseExample, 7, "scalar arrays must generate a real response example");
  assert.deepEqual(staticApi.responseExample, { ok: true, source: "static-json" }, "static JSON must generate a real response example");
  assert.equal(textApi.responseExample, "alpha", "text files must generate a real response example");
  const openApiSlug = `openapi-${runId}`;
  const openApiDocument = `openapi: 3.1.0
info:
  title: Portable OpenAPI Service
  version: 2026.1
  description: Imported from a generic OpenAPI document
servers:
  - url: https://example.com
paths:
  /:
    parameters:
      - $ref: '#/components/parameters/Language'
    get:
      summary: Read generic upstream page
      responses:
        '200':
          $ref: '#/components/responses/HtmlResponse'
  /entities/{entityId}:
    get:
      summary: Read an entity
      parameters:
        - name: entityId
          in: path
          required: true
          schema:
            type: integer
      responses:
        '200':
          description: Entity response
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Entity'
              example:
                id: 42
                name: imported
                active: true
    post:
      summary: Update an entity
      parameters:
        - name: entityId
          in: path
          required: true
          schema:
            type: integer
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/EntityUpdate'
      responses:
        '200':
          description: Updated entity
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Entity'
components:
  parameters:
    Language:
      name: language
      in: query
      required: false
      description: Preferred response language
      schema:
        type: string
        default: zh-CN
  responses:
    HtmlResponse:
      description: HTML page
      content:
        text/html:
          schema:
            type: string
  schemas:
    Entity:
      type: object
      required: [id, name]
      properties:
        id:
          type: integer
          description: Entity identifier
        name:
          type: string
          description: Entity name
        active:
          type: boolean
          description: Entity state
    EntityUpdate:
      allOf:
        - type: object
          required: [name]
          properties:
            name:
              type: string
              minLength: 1
        - type: object
          properties:
            active:
              type: boolean
`;
  let openApiImport = await importOpenApi(adminCookie, { name: "Portable OpenAPI Service", slug: openApiSlug }, openApiDocument);
  const openApiProduct = openApiImport.data;
  assert.equal(openApiProduct.endpoint, `/api/${openApiSlug}`);
  assert.ok(openApiProduct.requestParameters.some((parameter) => parameter.name === "language" && parameter.location === "QUERY" && parameter.defaultValue === "zh-CN"), "OpenAPI component parameters must be resolved");
  openApiImport = await importOpenApi(adminCookie, { name: "Conflicting OpenAPI Service", slug: `conflict-${openApiSlug}`, publicPrefix: `/api/${openApiSlug}` }, openApiDocument, 409);
  assert.match(openApiImport.message, /冲突/);
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nZcAAAAASUVORK5CYII=", "base64");
  const administratorApprovedImage = Buffer.from("administrator-approved-image-content");
  const imageApi = await createApi(adminCookie, { sourceType: "RANDOM_IMAGE", name: "Random Image Smoke", slug: `image-${runId}` }, [
    { name: "pixel.png", blob: new Blob([png], { type: "image/png" }) },
    { name: "administrator-approved.jpg", blob: new Blob([administratorApprovedImage], { type: "image/jpeg" }) },
    { name: "same-approved-content.data", blob: new Blob([administratorApprovedImage], { type: "application/octet-stream" }) },
  ]);
  assert.equal(imageApi.assetCount, 2, "initial media import must accept administrator-approved content and remove content duplicates");
  const duplicateInitialImage = await uploadMedia(adminCookie, imageApi.id, "pixel-streamed.png", png, "image/png", 200);
  assert.equal(duplicateInitialImage.data.duplicate, true, "streamed media must deduplicate content imported during API creation");
  const videoApi = await createApi(adminCookie, { sourceType: "RANDOM_VIDEO", name: "Random Video Smoke", slug: `video-${runId}` });
  const tinyMp4 = Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0, 0x69, 0x73, 0x6f, 0x6d, 0x6d, 0x70, 0x34, 0x32]);
  await uploadMedia(adminCookie, videoApi.id, "tiny.mp4", tinyMp4, "video/mp4");
  const administratorMediaApi = await createApi(adminCookie, { sourceType: "RANDOM_VIDEO", name: "Trusted Media Smoke", slug: `trusted-media-${runId}` });
  const administratorApprovedVideo = Buffer.from("administrator-approved-content");
  await uploadMedia(adminCookie, administratorMediaApi.id, "administrator-approved.mp4", administratorApprovedVideo, "video/mp4");
  const duplicateVideo = await uploadMedia(adminCookie, administratorMediaApi.id, "same-content-any-name.bin", administratorApprovedVideo, "application/octet-stream", 200);
  assert.equal(duplicateVideo.data.duplicate, true, "server-side checksums must deduplicate media regardless of filename");
  const cleanupImageApi = await createApi(adminCookie, { sourceType: "RANDOM_IMAGE", name: "Batch Content Smoke", slug: `image-batch-${runId}` });
  const approvedA = Buffer.from("administrator-approved-image-a");
  const approvedB = Buffer.from("administrator-approved-image-b");
  const mediaArchive = zipSync({ "nested/approved-a.jpg": approvedA, "nested/approved-a-copy.data": approvedA, "approved-b.custom": approvedB });
  const archiveUpload = await uploadMedia(adminCookie, cleanupImageApi.id, "approved-media.zip", mediaArchive, "application/zip");
  assert.equal(archiveUpload.data.uploaded, 2, "ZIP media import must persist every unique administrator-approved entry");
  assert.equal(archiveUpload.data.duplicates, 1, "ZIP media import must deduplicate matching entries");
  assert.equal(archiveUpload.data.skipped.length, 0, "valid ZIP entries must not be content-filtered");
  const unsafeMediaArchive = zipSync({ "../escape.jpg": approvedA, "later.jpg": approvedB });
  const unsafeArchiveUpload = await uploadMedia(adminCookie, cleanupImageApi.id, "unsafe-media.zip", unsafeMediaArchive, "application/zip", 400);
  assert.match(unsafeArchiveUpload.message, /不安全/);
  const unsupportedMediaArchive = Uint8Array.from(zipSync({ "unsupported.jpg": approvedA }));
  new DataView(unsupportedMediaArchive.buffer, unsupportedMediaArchive.byteOffset, unsupportedMediaArchive.byteLength).setUint16(8, 99, true);
  const unsupportedArchiveUpload = await uploadMedia(adminCookie, cleanupImageApi.id, "unsupported-media.zip", unsupportedMediaArchive, "application/zip", 400);
  assert.match(unsupportedArchiveUpload.message, /不支持/);
  result = await jsonRequest(`/api/v1/admin/apis/assets?productId=${encodeURIComponent(cleanupImageApi.id)}`, {}, adminCookie);
  expectStatus(result.response.status, 200, "list ZIP-imported media", result.body);
  assert.equal(result.body.meta.total, 2);
  result = await jsonRequest(`/api/v1/admin/apis/assets?productId=${encodeURIComponent(cleanupImageApi.id)}`, { method: "DELETE", body: { ids: [result.body.data[0].id] } }, adminCookie);
  expectStatus(result.response.status, 200, "batch delete selected media", result.body);
  assert.equal(result.body.data.deleted, 1);
  result = await jsonRequest(`/api/v1/admin/apis/assets?productId=${encodeURIComponent(cleanupImageApi.id)}&all=true`, { method: "DELETE" }, adminCookie);
  expectStatus(result.response.status, 200, "clear all API media", result.body);
  assert.equal(result.body.data.deleted, 1);
  const cleanupVideoApi = await createApi(adminCookie, { sourceType: "RANDOM_VIDEO", name: "Disposable Video Smoke", slug: `video-delete-${runId}` });
  await uploadMedia(adminCookie, cleanupVideoApi.id, "delete-me.mp4", tinyMp4, "video/mp4");
  response = await request(`/api/v1/admin/apis?id=${encodeURIComponent(cleanupVideoApi.id)}`, { method: "DELETE" }, adminCookie);
  expectStatus(response.status, 200, "delete draft media API and stored file", await response.json());
  const phpArchive = zipSync({ "hitokoto-service/index.php": strToU8("<?php header('Content-Type: application/json'); $items = json_decode(file_get_contents('data/a.json'), true); echo json_encode(['ok' => true, 'source' => 'php', 'text' => $items[0]]);"), "hitokoto-service/data/a.json": strToU8('["hello"]') });
  const phpApi = await createApi(adminCookie, { sourceType: "PHP_PACKAGE", name: "PHP Smoke", slug: `php-${runId}`, methods: ["ALL"], entryFile: "" }, [{ name: "smoke.zip", blob: new Blob([phpArchive], { type: "application/zip" }) }]);
  result = await jsonRequest(`/api/v1/admin/apis/config?id=${encodeURIComponent(phpApi.id)}`, {}, adminCookie);
  expectStatus(result.response.status, 200, "read auto-detected nested PHP entry", result.body);
  assert.equal(result.body.data.entryFile, "hitokoto-service/index.php", "nested PHP entry must be detected and persisted");
  const builtinApi = await createApi(adminCookie, { sourceType: "BUILTIN", name: "UUID Smoke", slug: `uuid-${runId}`, internalHandler: "utility.uuid" });
  const digestApi = await createApi(adminCookie, { sourceType: "BUILTIN", name: "SHA-256 Smoke", slug: `digest-${runId}`, methods: ["POST"], internalHandler: "crypto.sha256" });
  const localApi = await createApi(adminCookie, { sourceType: "SERVER_LOCAL", name: "Local Upstream Smoke", slug: `local-${runId}`, upstreamBaseUrl: `http://host.docker.internal:${localUpstreamPort}/fixed/`, rewriteMode: "EXACT", healthPath: "/health" });
  const externalApi = await createApi(adminCookie, { sourceType: "EXTERNAL", name: "External Upstream Smoke", slug: `external-${runId}`, upstreamBaseUrl: "https://example.com", rewriteMode: "EXACT", healthPath: "/" });
  const redirectApi = await createApi(adminCookie, { sourceType: "EXTERNAL", name: "Second External Upstream Smoke", slug: `external-second-${runId}`, upstreamBaseUrl: "https://example.com", rewriteMode: "EXACT", healthPath: "/" });
  const tunnelApi = await createApi(adminCookie, { sourceType: "TUNNEL", name: "Tunnel Upstream Smoke", slug: `tunnel-${runId}`, upstreamBaseUrl: "https://example.com", rewriteMode: "EXACT", healthPath: "/" });
  result = await jsonRequest(`/api/v1/admin/apis/config?id=${encodeURIComponent(externalApi.id)}`, {}, adminCookie);
  expectStatus(result.response.status, 200, "read external API configuration", result.body);
  const externalConfig = result.body.data;
  result = await jsonRequest("/api/v1/admin/apis/config", { method: "PATCH", body: {
    id: externalConfig.id,
    name: "External Upstream Smoke Updated",
    shortName: "Ext",
    description: "Updated public upstream configuration.",
    color: "#0f766e",
    tags: ["e2e", "external"],
    featured: false,
    sla: "99.9",
    categoryId: externalConfig.categoryId,
    visibility: externalConfig.visibility,
    billingMode: externalConfig.billingMode,
    unitPrice: externalConfig.unitPrice,
    freeQuotaMonthly: externalConfig.freeQuotaMonthly,
    defaultQpsLimit: externalConfig.defaultQpsLimit,
    route: { ...externalConfig.route, methods: ["GET", "POST"], responseExample: null, summary: "Editable external API contract", forceHttps: false },
    upstream: { rewriteMode: externalConfig.upstream.rewriteMode, upstreamPrefix: externalConfig.upstream.upstreamPrefix, healthPath: externalConfig.upstream.healthPath, timeoutMs: externalConfig.upstream.timeoutMs, authType: externalConfig.upstream.authType, preserveSecret: externalConfig.upstream.secretConfigured, token: "", headerName: "", headerValue: "", nodes: externalConfig.upstream.nodes.map(({ name, baseUrl, weight, enabled }) => ({ name, baseUrl, weight, enabled })) },
    parameters: [{ location: "QUERY", name: "topic", upstreamName: "topic", required: false, dataType: "string", defaultValue: "", description: "Optional upstream topic", pattern: "", sensitive: false }],
    responseParameters: [{ name: "body", dataType: "string", description: "Upstream response body" }],
  } }, adminCookie);
  expectStatus(result.response.status, 200, "update external API complete configuration", result.body);
  result = await jsonRequest(`/api/v1/admin/apis/config?id=${encodeURIComponent(externalApi.id)}`, {}, adminCookie);
  expectStatus(result.response.status, 200, "confirm external API configuration persistence", result.body);
  assert.equal(result.body.data.name, "External Upstream Smoke Updated");
  assert.deepEqual(result.body.data.route.methods, ["GET", "POST"]);
  assert.equal(result.body.data.route.responseExample, null, "JSON null must persist as a valid response example");
  assert.deepEqual(result.body.data.parameters.map(({ name, location }) => ({ name, location })), [{ name: "topic", location: "QUERY" }]);
  assert.deepEqual(result.body.data.responseParameters.map(({ name, dataType }) => ({ name, dataType })), [{ name: "body", dataType: "string" }]);

  const quickForm = new FormData();
  quickForm.set("config", JSON.stringify({ sourceType: "STATIC_JSON", categoryId: defaultCategoryId, name: "快速接口", content: JSON.stringify({ ok: true, source: "quick-create" }) }));
  response = await request("/api/v1/admin/apis", { method: "POST", body: quickForm }, adminCookie);
  let quickBody = await response.json().catch(() => null);
  expectStatus(response.status, 201, "minimal quick API creation", quickBody);
  const quickApi = quickBody.data;
  assert.match(quickApi.slug, /^api-[a-z0-9]{6}(?:-\d+)?$/);
  assert.equal(quickApi.endpoint, `/api/${quickApi.slug}`);
  assert.equal(quickApi.publicHost, new URL(portalUrl).hostname);

  result = await jsonRequest(`/api/v1/admin/apis/routes/check?${new URLSearchParams({ host: staticApi.publicHost, path: staticApi.endpoint, version: "v1", methods: "GET", slug: staticApi.slug })}`, {}, adminCookie);
  expectStatus(result.response.status, 200, "route preflight detects conflict", result.body);
  assert.equal(result.body.data.available, false);
  assert.equal(result.body.data.routeAvailable, false);

  result = await jsonRequest(`/api/v1/admin/apis/routes/check?${new URLSearchParams({ host: phpApi.publicHost, path: phpApi.endpoint, version: "v1", methods: "GET", slug: `php-get-${runId}` })}`, {}, adminCookie);
  expectStatus(result.response.status, 200, "ALL method route conflict detection", result.body);
  assert.equal(result.body.data.routeAvailable, false);

  const duplicateRouteForm = new FormData();
  duplicateRouteForm.set("config", JSON.stringify({ sourceType: "STATIC_JSON", categoryId: defaultCategoryId, name: "Duplicate Route", slug: `duplicate-${runId}`, publicHost: staticApi.publicHost, publicPath: staticApi.endpoint, content: JSON.stringify({ duplicate: true }) }));
  response = await request("/api/v1/admin/apis", { method: "POST", body: duplicateRouteForm }, adminCookie);
  expectStatus(response.status, 409, "duplicate route rejected on creation", await response.text());

  const privateForm = new FormData();
  privateForm.set("config", JSON.stringify({ sourceType: "EXTERNAL", categoryId: defaultCategoryId, name: "Blocked Private Upstream", slug: `blocked-upstream-${runId}`, publicHost: new URL(portalUrl).hostname, publicPath: `/api/blocked-upstream-${runId}`, upstreamBaseUrl: "http://127.0.0.1:8080" }));
  response = await request("/api/v1/admin/apis", { method: "POST", body: privateForm }, adminCookie);
  expectStatus(response.status, 400, "block private external upstream on creation", await response.text());

  for (const product of [staticApi, paidDirectApi, textApi, datasetApi, mergedDatasetApi, genericDatasetApi, scalarDatasetApi, objectMapDatasetApi, portableDatasetApi, sniffedDatasetApi, zippedDatasetApi, openApiProduct, imageApi, videoApi, phpApi, builtinApi, localApi, externalApi, redirectApi, tunnelApi, quickApi]) {
    assert.equal(product.publicHost, new URL(portalUrl).hostname, `${product.slug} must use the platform host`);
    assert.match(product.endpoint, /^\/api\//, `${product.slug} must use the /api prefix`);
  }
  const portal = new URL(portalUrl);
  const alternateHost = portal.hostname === "localhost" ? "127.0.0.1" : "localhost";
  const alternatePublicUrl = `${portal.protocol}//${alternateHost}${portal.port ? `:${portal.port}` : ""}`;
  const platformSettings = { name: "Star-API E2E", description: "Automated end-to-end verification environment.", icpNumber: "Test ICP 2026", publicSecurityNumber: "Test Public Security 42000000000001", iconAction: "keep", heroAction: "keep" };
  result = await jsonRequest("/api/v1/admin/settings", { method: "PATCH", body: { ...platformSettings, publicUrl: alternatePublicUrl } }, adminCookie);
  expectStatus(result.response.status, 200, "changing public URL migrates API routes", result.body);
  result = await jsonRequest(`/api/v1/admin/apis/config?id=${encodeURIComponent(staticApi.id)}`, {}, adminCookie);
  expectStatus(result.response.status, 200, "read API route after public URL migration", result.body);
  assert.equal(result.body.data.route.publicHost, alternateHost);
  assert.equal(result.body.data.route.publicPath, staticApi.endpoint);
  result = await jsonRequest("/api/v1/admin/settings", { method: "PATCH", body: { ...platformSettings, publicUrl: portalUrl } }, adminCookie);
  expectStatus(result.response.status, 200, "restoring public URL migrates API routes", result.body);
  for (const product of [staticApi, paidDirectApi, textApi, datasetApi, mergedDatasetApi, genericDatasetApi, scalarDatasetApi, objectMapDatasetApi, portableDatasetApi, sniffedDatasetApi, zippedDatasetApi, openApiProduct, imageApi, videoApi, phpApi, builtinApi, digestApi, localApi, externalApi, redirectApi, tunnelApi, quickApi]) await publishApi(adminCookie, product);

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
  result = await jsonRequest("/api/v1/catalog");
  expectStatus(result.response.status, 200, "read published catalog for documentation", result.body);
  assert.ok(result.body.data.length > 1, "documentation test requires multiple published endpoints");
  for (const product of result.body.data) {
    assert.ok(docsHtml.includes(product.name), `documentation must include published endpoint name ${product.name}`);
    assert.ok(docsHtml.includes(`${portalUrl}${product.endpoint}`), `documentation must include published endpoint URL ${product.endpoint}`);
  }
  assert.ok((docsHtml.match(/curl --request/g) ?? []).length >= result.body.data.length, "documentation must include a curl command for every published endpoint");

  response = await request(`/apis/${staticSlug}`);
  const detailHtml = await response.text();
  expectStatus(response.status, 200, "API detail uses direct public route", detailHtml);
  assert.ok(detailHtml.includes(`${portalUrl}${staticApi.endpoint}`), "API detail must use the platform domain and /api public path");
  assert.ok(!detailHtml.includes("/api/v1/gateway/"), "API detail must not add a legacy API prefix");
  response = await request(`/apis/${datasetApi.slug}`);
  const datasetDetailHtml = await response.text();
  expectStatus(response.status, 200, "dataset API detail exposes contract", datasetDetailHtml);
  assert.ok(datasetDetailHtml.includes("请求参数") && datasetDetailHtml.includes("返回参数") && datasetDetailHtml.includes("Selected dataset content"), "dataset detail must render request and response tables");

  result = await jsonRequest("/api/v1/apps", { method: "POST", body: { name: "E2E Test App", environment: "TEST" } }, personalCookie);
  expectStatus(result.response.status, 201, "create application and API key", result.body);
  const appId = result.body.data.app.id;
  const apiKey = result.body.data.secret;
  assert.match(apiKey, /^sk_test_/);
  result = await jsonRequest("/api/v1/apps");
  expectStatus(result.response.status, 401, "anonymous application refresh rejected", result.body);
  result = await jsonRequest("/api/v1/apps", {}, personalCookie);
  expectStatus(result.response.status, 200, "authenticated application refresh", result.body);
  assert.equal(result.body.data.find((app) => app.id === appId)?.calls, 0);

  let latestSubscriptionResult;
  for (const product of [staticApi, paidDirectApi, textApi, datasetApi, mergedDatasetApi, genericDatasetApi, scalarDatasetApi, objectMapDatasetApi, portableDatasetApi, sniffedDatasetApi, zippedDatasetApi, openApiProduct, imageApi, videoApi, phpApi, builtinApi, digestApi, localApi, externalApi, redirectApi, tunnelApi, quickApi]) latestSubscriptionResult = await subscribe(personalCookie, appId, product.id, product.slug);

  const datasetSubscription = latestSubscriptionResult.data.subscriptions.find((item) => item.productId === datasetApi.id);
  const datasetEndpoint = datasetSubscription?.endpoints.find((item) => item.methods.includes("GET") || item.methods.includes("ALL"));
  assert.ok(datasetSubscription && datasetEndpoint, "dataset subscription must expose a GET endpoint for direct links");
  result = await jsonRequest("/api/v1/direct-links", { method: "POST", body: { subscriptionId: datasetSubscription.id, endpointId: datasetEndpoint.id, name: "Dataset direct link", defaultParameters: { name: "menu", type: "json" }, expiresInDays: 7 } });
  expectStatus(result.response.status, 401, "anonymous direct-link creation rejected", result.body);
  result = await jsonRequest("/api/v1/direct-links", { method: "POST", body: { subscriptionId: datasetSubscription.id, endpointId: datasetEndpoint.id, name: "Dataset direct link", defaultParameters: { name: "menu", type: "json" }, expiresInDays: 7 } }, personalCookie);
  expectStatus(result.response.status, 201, "create scoped API direct link", result.body);
  const directLinkId = result.body.data.directLinkId;
  const directLinkPath = result.body.data.path;
  assert.match(directLinkPath, /^\/l\/dl_[A-Za-z0-9_-]{32,}$/);
  assert.equal(result.body.data.app.directLinks.find((item) => item.id === directLinkId)?.path, directLinkPath, "authorized application view must retain the copyable direct link");
  response = await request(directLinkPath);
  const directMenu = await response.json();
  expectStatus(response.status, 200, "direct link returns raw API content", directMenu);
  assert.deepEqual(directMenu.categories, ["notices", "quotes"]);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow, noarchive");
  assert.ok(response.headers.get("x-star-request-id"), "direct-link calls must pass through the public gateway");
  response = await request(`${directLinkPath}?name=quotes&type=json`);
  const directOverride = await response.json();
  expectStatus(response.status, 200, "direct-link query overrides saved defaults", directOverride);
  assert.ok(["quote-alpha", "quote-beta"].includes(directOverride.content));
  result = await jsonRequest("/api/v1/direct-links", { method: "PATCH", body: { id: directLinkId } }, personalCookie);
  expectStatus(result.response.status, 200, "revoke API direct link", result.body);
  response = await request(directLinkPath);
  expectStatus(response.status, 404, "revoked direct link rejected", await response.json());

  result = await jsonRequest("/api/v1/admin/subscriptions", {}, personalCookie);
  expectStatus(result.response.status, 403, "non-admin subscription policy access denied", result.body);
  result = await jsonRequest("/api/v1/admin/subscriptions", {}, adminCookie);
  expectStatus(result.response.status, 200, "administrator reads subscription policies", result.body);
  const managedSubscription = result.body.data.find((item) => item.app.id === appId && item.product.id === quickApi.id);
  assert.ok(managedSubscription, "administrator subscription policy list must include the user's real subscription");
  result = await jsonRequest("/api/v1/admin/subscriptions", { method: "PATCH", body: { id: managedSubscription.id, quotaMonthly: 4321, qpsLimit: 37 } }, adminCookie);
  expectStatus(result.response.status, 200, "administrator updates subscription policy", result.body);
  result = await jsonRequest("/api/v1/admin/subscriptions", {}, adminCookie);
  expectStatus(result.response.status, 200, "administrator confirms persisted subscription policy", result.body);
  const persistedSubscription = result.body.data.find((item) => item.id === managedSubscription.id);
  assert.equal(persistedSubscription.quotaMonthly, "4321");
  assert.equal(persistedSubscription.qpsLimit, 37);
  response = await request("/console/apps", {}, personalCookie);
  const userAppsHtml = await response.text();
  expectStatus(response.status, 200, "user application page renders updated subscription quota", userAppsHtml);
  assert.match(userAppsHtml, /本月配额[^<]*4,321[^<]*次/, "user application page must explain the configured monthly quota");

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

  result = await jsonRequest("/api/v1/admin/wallet", { method: "PATCH", body: { tenantId: personalTenantId, type: "ADMIN_RECHARGE", amount: "10.00", reason: "E2E paid API verification" } }, adminCookie);
  expectStatus(result.response.status, 200, "administrator funds paid API test account", result.body);
  assert.equal(result.body.data.balance, "10");

  const paidDirectSubscription = latestSubscriptionResult.data.subscriptions.find((item) => item.productId === paidDirectApi.id);
  const paidDirectEndpoint = paidDirectSubscription?.endpoints.find((item) => item.methods.includes("GET") || item.methods.includes("ALL"));
  assert.ok(paidDirectSubscription && paidDirectEndpoint, "paid API subscription must expose a GET direct-link endpoint");
  result = await jsonRequest("/api/v1/apps", {}, personalCookie);
  expectStatus(result.response.status, 200, "application usage before paid direct link", result.body);
  const paidAppBefore = result.body.data.find((app) => app.id === appId);
  assert.ok(paidAppBefore, "paid direct-link application must be visible");
  result = await jsonRequest("/api/v1/wallet", {}, personalCookie);
  expectStatus(result.response.status, 200, "wallet before paid direct link", result.body);
  const directBalanceBefore = Number(result.body.data.balance);
  result = await jsonRequest("/api/v1/direct-links", { method: "POST", body: { subscriptionId: paidDirectSubscription.id, endpointId: paidDirectEndpoint.id, name: "Paid direct link", defaultParameters: {}, expiresInDays: 7 } }, personalCookie);
  expectStatus(result.response.status, 201, "create paid API direct link", result.body);
  const paidDirectLinkId = result.body.data.directLinkId;
  const paidDirectPath = result.body.data.path;
  response = await request(paidDirectPath);
  const paidDirectBody = await response.json();
  expectStatus(response.status, 200, "paid direct link gateway call", paidDirectBody);
  assert.deepEqual(paidDirectBody, { ok: true, source: "paid-direct-link" });
  assert.equal(Number(response.headers.get("x-request-cost")), 0.4, "paid direct link must expose the charged amount");
  assert.equal(response.headers.get("x-billable-units"), "1");
  result = await jsonRequest("/api/v1/apps", {}, personalCookie);
  expectStatus(result.response.status, 200, "application usage after paid direct link", result.body);
  const paidAppAfter = result.body.data.find((app) => app.id === appId);
  assert.equal(paidAppAfter.calls, paidAppBefore.calls + 1, "paid direct link must increment application calls");
  assert.equal(Number(paidAppAfter.cost), Number(paidAppBefore.cost) + 0.4, "paid direct link must increment application cost exactly once");
  result = await jsonRequest("/api/v1/wallet", {}, personalCookie);
  expectStatus(result.response.status, 200, "wallet after paid direct link", result.body);
  assert.equal(Number(result.body.data.balance), directBalanceBefore - 0.4, "paid direct link must debit the tenant balance exactly once");
  const usageEntry = result.body.data.entries.find((entry) => entry.type === "API_USAGE" && Number(entry.delta) === -0.4);
  assert.ok(usageEntry, "paid direct link must create an API_USAGE wallet ledger entry");
  assert.equal(Number(usageEntry.balanceAfter), directBalanceBefore - 0.4);
  result = await jsonRequest("/api/v1/admin/subscriptions", {}, adminCookie);
  expectStatus(result.response.status, 200, "paid direct-link subscription usage", result.body);
  const paidUsage = result.body.data.find((item) => item.id === paidDirectSubscription.id);
  assert.equal(paidUsage.usageThisMonth, 1, "paid direct link must increment monthly subscription usage");
  assert.equal(paidUsage.usageToday, 1, "paid direct link must increment daily subscription usage");
  result = await jsonRequest("/api/v1/direct-links", { method: "PATCH", body: { id: paidDirectLinkId } }, personalCookie);
  expectStatus(result.response.status, 200, "revoke paid API direct link", result.body);

  response = await request(staticApi.endpoint, { headers: { Authorization: `Bearer ${apiKey}` } });
  expectStatus(response.status, 200, "gateway static JSON call", await response.text());
  assert.equal(response.headers.get("x-request-cost"), "0.25");
  assert.equal(response.headers.get("x-billable-units"), "1");
  response = await request(staticApi.endpoint, { headers: { Authorization: `Bearer ${apiKey}` } });
  expectStatus(response.status, 429, "gateway daily limit enforcement", await response.text());
  response = await request(textApi.endpoint, { headers: { Authorization: `Bearer ${apiKey}` } });
  expectStatus(response.status, 200, "gateway random text call", await response.text());
  response = await request(`${datasetApi.endpoint}?name=menu&type=json`, { headers: { Authorization: `Bearer ${apiKey}` } });
  const datasetMenu = await response.json();
  expectStatus(response.status, 200, "dataset category menu as JSON", datasetMenu);
  assert.deepEqual(datasetMenu.categories, ["notices", "quotes"]);
  response = await request(`${datasetApi.endpoint}?name=quotes&type=txt`, { headers: { Authorization: `Bearer ${apiKey}` } });
  const datasetText = await response.text();
  expectStatus(response.status, 200, "dataset JSON item as TXT", datasetText);
  assert.ok(["quote-alpha", "quote-beta"].includes(datasetText));
  response = await request(`${datasetApi.endpoint}?name=quotes&type=json`, { headers: { Authorization: `Bearer ${apiKey}` } });
  const datasetJson = await response.json();
  expectStatus(response.status, 200, "dataset JSON item as JSON", datasetJson);
  assert.ok(["quote-alpha", "quote-beta"].includes(datasetJson.content));
  response = await request(datasetApi.endpoint, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ name: "notices" }) });
  const datasetPostText = await response.text();
  expectStatus(response.status, 200, "dataset POST method call", datasetPostText);
  assert.ok(["notice-one", "notice-two"].includes(datasetPostText));
  response = await request(`${mergedDatasetApi.endpoint}?region=north&output=txt`, { headers: { Authorization: `Bearer ${apiKey}` } });
  const mergedDatasetText = await response.text();
  expectStatus(response.status, 200, "merged dataset nested-field filter as TXT", mergedDatasetText);
  assert.equal(mergedDatasetText, "north-entry");
  response = await request(`${mergedDatasetApi.endpoint}?region=south&output=json`, { headers: { Authorization: `Bearer ${apiKey}` } });
  const mergedDatasetJson = await response.json();
  expectStatus(response.status, 200, "merged dataset nested-field filter as JSON", mergedDatasetJson);
  assert.equal(mergedDatasetJson.body, "south-entry");
  response = await request(genericDatasetApi.endpoint, { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } });
  const genericDatasetJson = await response.json();
  expectStatus(response.status, 200, "generic dataset without business-specific configuration as JSON", genericDatasetJson);
  assert.ok(["generic-alpha", "generic-beta"].includes(genericDatasetJson.headline));
  response = await request(genericDatasetApi.endpoint, { headers: { Authorization: `Bearer ${apiKey}`, Accept: "text/plain" } });
  const genericDatasetText = await response.text();
  expectStatus(response.status, 200, "generic dataset response negotiation through Accept header", genericDatasetText);
  assert.ok(["generic-alpha", "generic-beta"].includes(genericDatasetText));
  response = await request(scalarDatasetApi.endpoint, { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } });
  const scalarDatasetJson = await response.json();
  expectStatus(response.status, 200, "scalar JSON dataset call", scalarDatasetJson);
  assert.ok([7, 11, 13].includes(scalarDatasetJson));
  response = await request(scalarDatasetApi.endpoint, { headers: { Authorization: `Bearer ${apiKey}`, Accept: "text/plain" } });
  const scalarDatasetText = await response.text();
  expectStatus(response.status, 200, "scalar dataset as TXT", scalarDatasetText);
  assert.ok(["7", "11", "13"].includes(scalarDatasetText));
  response = await request(`${objectMapDatasetApi.endpoint}?enabled=false`, { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } });
  const objectMapDatasetJson = await response.json();
  expectStatus(response.status, 200, "object-map dataset boolean filter", objectMapDatasetJson);
  assert.deepEqual(objectMapDatasetJson, { label: "Mapped beta", enabled: false });
  response = await request(`${portableDatasetApi.endpoint}?region=north`, { headers: { Authorization: `Bearer ${apiKey}`, Accept: "text/plain" } });
  const portableCsvText = await response.text();
  expectStatus(response.status, 200, "CSV record as TXT", portableCsvText);
  assert.equal(portableCsvText, "CSV value, with comma");
  response = await request(portableDatasetApi.endpoint, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ recordId: 202 }) });
  const portableYamlJson = await response.json();
  expectStatus(response.status, 200, "YAML record filtered by POST body", portableYamlJson);
  assert.deepEqual(portableYamlJson, { id: 202, region: "south", message: "YAML value" });
  response = await request(`${portableDatasetApi.endpoint}?region=east`, { headers: { Authorization: `Bearer ${apiKey}`, Accept: "text/plain" } });
  const portableJsonlText = await response.text();
  expectStatus(response.status, 200, "JSONL record as TXT", portableJsonlText);
  assert.equal(portableJsonlText, "JSONL value");
  response = await request(`${portableDatasetApi.endpoint}?region=central`, { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } });
  const portableTsvJson = await response.json();
  expectStatus(response.status, 200, "TSV record as JSON", portableTsvJson);
  assert.deepEqual(portableTsvJson, { id: "404", region: "central", message: "TSV value" });
  response = await request(`${sniffedDatasetApi.endpoint}?code=unknown-extension`, { headers: { Authorization: `Bearer ${apiKey}`, Accept: "text/plain" } });
  const sniffedDatasetText = await response.text();
  expectStatus(response.status, 200, "content-sniffed dataset filter and TXT response", sniffedDatasetText);
  assert.equal(sniffedDatasetText, "Detected by content");
  response = await request(`${zippedDatasetApi.endpoint}?category=list&format=json`, { headers: { Authorization: `Bearer ${apiKey}` } });
  const zippedDatasetMenu = await response.json();
  expectStatus(response.status, 200, "ZIP dataset directory groups", zippedDatasetMenu);
  assert.deepEqual(zippedDatasetMenu.categories, ["north--inventory", "south--catalog"]);
  response = await request(`${zippedDatasetApi.endpoint}?region=north&format=txt`, { headers: { Authorization: `Bearer ${apiKey}` } });
  const zippedCsvText = await response.text();
  expectStatus(response.status, 200, "ZIP dataset mixed-format GET filter", zippedCsvText);
  assert.equal(zippedCsvText, "North archive row");
  response = await request(zippedDatasetApi.endpoint, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ sku: "S-2" }) });
  const zippedJsonRecord = await response.json();
  expectStatus(response.status, 200, "ZIP dataset POST body filter", zippedJsonRecord);
  assert.deepEqual(zippedJsonRecord, { sku: "S-2", region: "south", message: "South archive row" });
  response = await request(openApiProduct.endpoint, { headers: { Authorization: `Bearer ${apiKey}`, Accept: "text/html" } });
  const importedOpenApiHtml = await response.text();
  expectStatus(response.status, 200, "imported OpenAPI gateway path mapping", importedOpenApiHtml);
  assert.match(importedOpenApiHtml, /Example Domain/);
  result = await jsonRequest(`/api/v1/admin/apis/routes/check?${new URLSearchParams({ host: new URL(portalUrl).hostname, path: `/api/${openApiSlug}/entities/{entityId}`, version: "2026.1", methods: "GET,POST", slug: `unrelated-${runId}` })}`, {}, adminCookie);
  expectStatus(result.response.status, 200, "imported OpenAPI path and methods exist", result.body);
  assert.equal(result.body.data.routeAvailable, false);

  const replacementDataset = new FormData();
  replacementDataset.set("productId", genericDatasetApi.id);
  replacementDataset.append("assets", new Blob([JSON.stringify({ hints: ["not", "records"], records: [{ state: "ready" }, { state: "standby" }] })], { type: "application/json" }), "service-state.json");
  response = await request("/api/v1/admin/apis/assets", { method: "POST", body: replacementDataset }, adminCookie);
  expectStatus(response.status, 400, "reject replacement that violates the configured data path", await response.json());
  const validReplacementDataset = new FormData();
  validReplacementDataset.set("productId", genericDatasetApi.id);
  validReplacementDataset.append("assets", new Blob([JSON.stringify({ hints: ["not", "records"], envelope: { entries: [{ state: "ready" }, { state: "standby" }] } })], { type: "application/json" }), "service-state.json");
  response = await request("/api/v1/admin/apis/assets", { method: "POST", body: validReplacementDataset }, adminCookie);
  expectStatus(response.status, 201, "replace a generic dataset", await response.json());
  result = await jsonRequest(`/api/v1/admin/apis/config?id=${encodeURIComponent(genericDatasetApi.id)}`, {}, adminCookie);
  expectStatus(result.response.status, 200, "dataset replacement refreshes response example", result.body);
  assert.deepEqual(result.body.data.route.responseExample, { state: "ready" });
  assert.equal(result.body.data.dataset.contractMode, "AUTO");
  assert.ok(result.body.data.parameters.some((parameter) => parameter.name === "state" && parameter.upstreamName === "state"), "automatic contracts must refresh request fields after replacing a dataset");
  assert.deepEqual(result.body.data.responseParameters.map(({ name, dataType }) => ({ name, dataType })), [{ name: "state", dataType: "string" }], "automatic contracts must discard stale response fields after replacing a dataset");
  response = await request(genericDatasetApi.endpoint, { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } });
  const replacementDatasetJson = await response.json();
  expectStatus(response.status, 200, "replacement dataset is live", replacementDatasetJson);
  assert.ok(["ready", "standby"].includes(replacementDatasetJson.state));
  const manualReplacement = new FormData();
  manualReplacement.set("productId", portableDatasetApi.id);
  manualReplacement.append("assets", new Blob([JSON.stringify([{ id: 505, region: "remote", message: "Manual contract value", extra: true }])], { type: "application/json" }), "manual-replacement.json");
  response = await request("/api/v1/admin/apis/assets", { method: "POST", body: manualReplacement }, adminCookie);
  expectStatus(response.status, 201, "replace a manually contracted dataset", await response.json());
  result = await jsonRequest(`/api/v1/admin/apis/config?id=${encodeURIComponent(portableDatasetApi.id)}`, {}, adminCookie);
  expectStatus(result.response.status, 200, "manual dataset contract survives replacement", result.body);
  assert.equal(result.body.data.dataset.contractMode, "MANUAL");
  assert.ok(result.body.data.parameters.some((parameter) => parameter.name === "recordId" && parameter.upstreamName === "id"), "manual request fields must be retained after replacing data");
  assert.deepEqual(result.body.data.responseParameters.map(({ name }) => name), ["id", "message"], "manual response fields must be retained after replacing data");
  response = await request(imageApi.endpoint, { headers: { Authorization: `Bearer ${apiKey}` } });
  expectStatus(response.status, 200, "gateway random image call", await response.text());
  assert.match(response.headers.get("content-type") ?? "", /^image\//);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("content-security-policy"), "sandbox; default-src 'none'");
  response = await request(videoApi.endpoint, { headers: { Authorization: `Bearer ${apiKey}`, Range: "bytes=0-7" } });
  expectStatus(response.status, 206, "gateway random video range call", await response.arrayBuffer());
  assert.equal(response.headers.get("content-range"), `bytes 0-7/${tinyMp4.length}`);
  assert.equal(response.headers.get("accept-ranges"), "bytes");
  assert.equal(response.headers.get("content-type"), "video/mp4");
  response = await request(phpApi.endpoint, { headers: { Authorization: `Bearer ${apiKey}` } });
  const phpResponse = await response.json();
  expectStatus(response.status, 200, "isolated nested PHP gateway call", phpResponse);
  assert.deepEqual(phpResponse, { ok: true, source: "php", text: "hello" });
  response = await request(builtinApi.endpoint, { headers: { Authorization: `Bearer ${apiKey}` } });
  expectStatus(response.status, 200, "built-in API gateway call", await response.text());
  response = await request(digestApi.endpoint, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "text/plain" }, body: "general-purpose-input" });
  const digestResponse = await response.json();
  expectStatus(response.status, 200, "built-in POST preserves an unstructured request body", digestResponse);
  assert.match(digestResponse.data.digest, /^[a-f0-9]{64}$/);
  response = await request(localApi.endpoint, { headers: { Authorization: `Bearer ${apiKey}` } });
  const localResponse = await response.json();
  expectStatus(response.status, 200, "server-local exact-address gateway call", localResponse);
  assert.equal(localResponse.path, "/fixed/", "exact-address mode must not append the public route path");
  response = await request(externalApi.endpoint, { headers: { Authorization: `Bearer ${apiKey}` } });
  expectStatus(response.status, 200, "external upstream gateway call", await response.text());
  response = await request(redirectApi.endpoint, { headers: { Authorization: `Bearer ${apiKey}` } });
  expectStatus(response.status, 200, "redirected external upstream gateway call", await response.text());
  response = await request(tunnelApi.endpoint, { headers: { Authorization: `Bearer ${apiKey}` } });
  expectStatus(response.status, 200, "tunnel upstream gateway call", await response.text());
  response = await request(quickApi.endpoint, { headers: { Authorization: `Bearer ${apiKey}` } });
  expectStatus(response.status, 200, "quick-created API gateway call", await response.text());
  response = await request(textApi.endpoint, { headers: { Authorization: "Bearer invalid-key" } });
  expectStatus(response.status, 401, "invalid API key rejected", await response.text());

  result = await jsonRequest("/api/v1/admin/apis/statistics", {}, adminCookie);
  expectStatus(result.response.status, 200, "statistics after gateway calls", result.body);
  assert.ok(result.body.data.totalCalls >= callsBefore + 10, "successful gateway calls must increase total statistics");
  assert.ok(result.body.data.todayCalls >= callsBefore + 10, "successful gateway calls must increase today's statistics");
  assert.ok(result.body.data.daily.reduce((sum, point) => sum + point.success + point.failed, 0) >= 10, "seven-day series must contain gateway calls");

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
  const deletedApiHtml = await response.text();
  assert.ok(response.status === 200 || response.status === 404, `deleted API detail returned unexpected status ${response.status}`);
  assert.match(deletedApiHtml, /<meta name="robots" content="noindex"\s*\/?>/i, "deleted API detail must be marked noindex");
  assert.match(deletedApiHtml, /404: This page could not be found|This page could not be found/i, "deleted API detail must render the not-found boundary");
  assert.ok(!deletedApiHtml.includes("Removable API Smoke"), "deleted API content must not remain in the detail page");
  results.push("deleted API is removed from catalog");
  console.log("PASS deleted API is removed from catalog");

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
