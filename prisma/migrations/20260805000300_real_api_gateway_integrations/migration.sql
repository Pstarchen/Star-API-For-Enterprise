-- API execution and billing configuration. This migration intentionally seeds no business data.
CREATE TYPE "ApiExecutionMode" AS ENUM ('INTERNAL', 'EXTERNAL');
CREATE TYPE "BillingMode" AS ENUM ('FREE', 'PER_REQUEST');
CREATE TYPE "PaymentChannel" AS ENUM ('ALIPAY', 'WECHAT', 'BANK_TRANSFER');
CREATE TYPE "PaymentOrderStatus" AS ENUM ('PENDING', 'PAID', 'CANCELED', 'EXPIRED', 'REFUNDED');

ALTER TABLE "ApiProduct"
  ADD COLUMN "shortName" TEXT NOT NULL DEFAULT 'API',
  ADD COLUMN "color" TEXT NOT NULL DEFAULT '#08785d',
  ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "featured" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "executionMode" "ApiExecutionMode" NOT NULL DEFAULT 'EXTERNAL',
  ADD COLUMN "internalHandler" TEXT,
  ADD COLUMN "upstreamBaseUrl" TEXT,
  ADD COLUMN "upstreamAuthType" TEXT,
  ADD COLUMN "executionConfig" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "secretConfigEncrypted" BYTEA,
  ADD COLUMN "timeoutMs" INTEGER NOT NULL DEFAULT 10000,
  ADD COLUMN "billingMode" "BillingMode" NOT NULL DEFAULT 'FREE',
  ADD COLUMN "unitPrice" DECIMAL(12,6) NOT NULL DEFAULT 0,
  ADD COLUMN "freeQuotaMonthly" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "defaultQpsLimit" INTEGER NOT NULL DEFAULT 10;

ALTER TABLE "RequestLog"
  ADD COLUMN "apiKeyId" TEXT,
  ADD COLUMN "productId" TEXT,
  ADD COLUMN "method" TEXT NOT NULL DEFAULT 'GET',
  ADD COLUMN "path" TEXT NOT NULL DEFAULT '/',
  ADD COLUMN "billableUnits" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "amount" DECIMAL(14,6) NOT NULL DEFAULT 0,
  ADD COLUMN "responseBytes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "errorCode" TEXT,
  ADD COLUMN "billed" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "OAuthAccount" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  "username" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OAuthAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OAuthState" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "redirectPath" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OAuthState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IntegrationSetting" (
  "key" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "publicConfig" JSONB NOT NULL DEFAULT '{}',
  "secretEncrypted" BYTEA,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IntegrationSetting_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "PaymentOrder" (
  "id" TEXT NOT NULL,
  "orderNo" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "channel" "PaymentChannel" NOT NULL,
  "status" "PaymentOrderStatus" NOT NULL DEFAULT 'PENDING',
  "amount" DECIMAL(14,2) NOT NULL,
  "subject" TEXT NOT NULL,
  "externalTradeNo" TEXT,
  "paymentUrl" TEXT,
  "paidAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentOrder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OAuthAccount_provider_providerAccountId_key" ON "OAuthAccount"("provider", "providerAccountId");
CREATE INDEX "OAuthAccount_userId_idx" ON "OAuthAccount"("userId");
CREATE UNIQUE INDEX "OAuthState_tokenHash_key" ON "OAuthState"("tokenHash");
CREATE INDEX "OAuthState_provider_expiresAt_idx" ON "OAuthState"("provider", "expiresAt");
CREATE UNIQUE INDEX "PaymentOrder_orderNo_key" ON "PaymentOrder"("orderNo");
CREATE INDEX "PaymentOrder_tenantId_createdAt_idx" ON "PaymentOrder"("tenantId", "createdAt" DESC);
CREATE INDEX "PaymentOrder_status_createdAt_idx" ON "PaymentOrder"("status", "createdAt" DESC);
CREATE INDEX "RequestLog_productId_occurredAt_idx" ON "RequestLog"("productId", "occurredAt" DESC);
CREATE INDEX "RequestLog_apiKeyId_occurredAt_idx" ON "RequestLog"("apiKeyId", "occurredAt" DESC);

ALTER TABLE "OAuthAccount" ADD CONSTRAINT "OAuthAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentOrder" ADD CONSTRAINT "PaymentOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RequestLog" ADD CONSTRAINT "RequestLog_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RequestLog" ADD CONSTRAINT "RequestLog_productId_fkey" FOREIGN KEY ("productId") REFERENCES "ApiProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RequestLog" ADD CONSTRAINT "RequestLog_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "Endpoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;
