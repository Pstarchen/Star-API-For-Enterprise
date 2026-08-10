ALTER TYPE "ApiStatus" ADD VALUE 'GRAY';

CREATE TYPE "ApiVisibility" AS ENUM ('PUBLIC', 'PRIVATE', 'GRAY', 'INTERNAL');
CREATE TYPE "ApiUpstreamType" AS ENUM ('PUBLIC_API', 'SERVER_LOCAL', 'TUNNEL', 'CONTENT', 'PHP_PACKAGE', 'BUILTIN');
CREATE TYPE "ApiRewriteMode" AS ENUM ('PASSTHROUGH', 'PREFIX');
CREATE TYPE "ApiHealthStatus" AS ENUM ('UNKNOWN', 'HEALTHY', 'UNHEALTHY');
CREATE TYPE "ApiParameterLocation" AS ENUM ('PATH', 'QUERY', 'BODY');
CREATE TYPE "ApiAuditDecision" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED');

ALTER TABLE "Provider" ADD COLUMN "ownerTenantId" TEXT;
ALTER TABLE "ApiProduct" ADD COLUMN "visibility" "ApiVisibility" NOT NULL DEFAULT 'PUBLIC';
ALTER TABLE "ApiProduct"
  DROP COLUMN "executionMode",
  DROP COLUMN "upstreamBaseUrl",
  DROP COLUMN "upstreamAuthType",
  DROP COLUMN "secretConfigEncrypted",
  DROP COLUMN "timeoutMs";
DROP TYPE "ApiExecutionMode";

ALTER TABLE "Endpoint"
  ADD COLUMN "publicHost" TEXT NOT NULL DEFAULT 'localhost',
  ADD COLUMN "publicPath" TEXT NOT NULL DEFAULT '/',
  ADD COLUMN "routeVersion" TEXT NOT NULL DEFAULT 'v1',
  ADD COLUMN "requestFormat" TEXT NOT NULL DEFAULT 'JSON',
  ADD COLUMN "corsEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "forceHttps" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "ipAllowlist" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "ipDenylist" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "dailyLimit" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "requestLogging" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "ApiUpstream" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "type" "ApiUpstreamType" NOT NULL,
  "rewriteMode" "ApiRewriteMode" NOT NULL DEFAULT 'PASSTHROUGH',
  "upstreamPrefix" TEXT NOT NULL DEFAULT '',
  "healthPath" TEXT NOT NULL DEFAULT '/health',
  "healthStatus" "ApiHealthStatus" NOT NULL DEFAULT 'UNKNOWN',
  "timeoutMs" INTEGER NOT NULL DEFAULT 10000,
  "offlineOnFailure" BOOLEAN NOT NULL DEFAULT true,
  "authType" TEXT NOT NULL DEFAULT 'NONE',
  "secretConfigEncrypted" BYTEA,
  "allowPrivateNetwork" BOOLEAN NOT NULL DEFAULT false,
  "lastHealthCheckAt" TIMESTAMP(3),
  "lastHealthError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ApiUpstream_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApiUpstreamNode" (
  "id" TEXT NOT NULL,
  "upstreamId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "baseUrl" TEXT NOT NULL,
  "weight" INTEGER NOT NULL DEFAULT 100,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "healthStatus" "ApiHealthStatus" NOT NULL DEFAULT 'UNKNOWN',
  "failureCount" INTEGER NOT NULL DEFAULT 0,
  "lastCheckedAt" TIMESTAMP(3),
  "lastError" TEXT,
  CONSTRAINT "ApiUpstreamNode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApiParameter" (
  "id" TEXT NOT NULL,
  "endpointId" TEXT NOT NULL,
  "location" "ApiParameterLocation" NOT NULL,
  "name" TEXT NOT NULL,
  "upstreamName" TEXT,
  "required" BOOLEAN NOT NULL DEFAULT false,
  "dataType" TEXT NOT NULL DEFAULT 'string',
  "validation" JSONB NOT NULL DEFAULT '{}',
  "sensitive" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "ApiParameter_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApiResponseRule" (
  "id" TEXT NOT NULL,
  "endpointId" TEXT NOT NULL,
  "statusCode" INTEGER NOT NULL,
  "gatewayCode" TEXT,
  "template" JSONB,
  "maskedFields" TEXT[],
  CONSTRAINT "ApiResponseRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApiAccessGrant" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApiAccessGrant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApiAudit" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "reviewerId" TEXT,
  "decision" "ApiAuditDecision" NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApiAudit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApiTestCase" (
  "id" TEXT NOT NULL,
  "endpointId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "request" JSONB NOT NULL,
  "expected" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ApiTestCase_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApiUpstream_productId_key" ON "ApiUpstream"("productId");
CREATE UNIQUE INDEX "ApiUpstreamNode_upstreamId_baseUrl_key" ON "ApiUpstreamNode"("upstreamId", "baseUrl");
CREATE INDEX "ApiUpstreamNode_upstreamId_enabled_healthStatus_idx" ON "ApiUpstreamNode"("upstreamId", "enabled", "healthStatus");
CREATE UNIQUE INDEX "ApiParameter_endpointId_location_name_key" ON "ApiParameter"("endpointId", "location", "name");
CREATE UNIQUE INDEX "ApiResponseRule_endpointId_statusCode_key" ON "ApiResponseRule"("endpointId", "statusCode");
CREATE UNIQUE INDEX "ApiAccessGrant_productId_tenantId_key" ON "ApiAccessGrant"("productId", "tenantId");
CREATE INDEX "ApiAudit_productId_createdAt_idx" ON "ApiAudit"("productId", "createdAt" DESC);
CREATE INDEX "ApiTestCase_endpointId_updatedAt_idx" ON "ApiTestCase"("endpointId", "updatedAt" DESC);
CREATE UNIQUE INDEX "Endpoint_publicHost_publicPath_routeVersion_method_key" ON "Endpoint"("publicHost", "publicPath", "routeVersion", "method");
CREATE INDEX "Endpoint_publicHost_publicPath_idx" ON "Endpoint"("publicHost", "publicPath");
CREATE INDEX "Provider_ownerTenantId_idx" ON "Provider"("ownerTenantId");

ALTER TABLE "Provider" ADD CONSTRAINT "Provider_ownerTenantId_fkey" FOREIGN KEY ("ownerTenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ApiUpstream" ADD CONSTRAINT "ApiUpstream_productId_fkey" FOREIGN KEY ("productId") REFERENCES "ApiProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApiUpstreamNode" ADD CONSTRAINT "ApiUpstreamNode_upstreamId_fkey" FOREIGN KEY ("upstreamId") REFERENCES "ApiUpstream"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApiParameter" ADD CONSTRAINT "ApiParameter_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "Endpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApiResponseRule" ADD CONSTRAINT "ApiResponseRule_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "Endpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApiAccessGrant" ADD CONSTRAINT "ApiAccessGrant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "ApiProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApiAccessGrant" ADD CONSTRAINT "ApiAccessGrant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApiAudit" ADD CONSTRAINT "ApiAudit_productId_fkey" FOREIGN KEY ("productId") REFERENCES "ApiProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApiAudit" ADD CONSTRAINT "ApiAudit_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ApiTestCase" ADD CONSTRAINT "ApiTestCase_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "Endpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Endpoint" ALTER COLUMN "publicHost" DROP DEFAULT;
ALTER TABLE "Endpoint" ALTER COLUMN "publicPath" DROP DEFAULT;
ALTER TABLE "Endpoint" ALTER COLUMN "routeVersion" DROP DEFAULT;
