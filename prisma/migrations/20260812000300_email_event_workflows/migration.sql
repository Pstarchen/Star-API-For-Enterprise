ALTER TYPE "WalletEntryType" ADD VALUE IF NOT EXISTS 'API_USAGE';

CREATE TYPE "EmailDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

ALTER TABLE "Tenant"
  ADD COLUMN "balanceAlerts" BOOLEAN NOT NULL DEFAULT true,
  ALTER COLUMN "balance" TYPE DECIMAL(14,6);

ALTER TABLE "WalletEntry"
  ADD COLUMN "requestLogId" TEXT,
  ALTER COLUMN "delta" TYPE DECIMAL(14,6),
  ALTER COLUMN "balanceAfter" TYPE DECIMAL(14,6);

CREATE UNIQUE INDEX "WalletEntry_requestLogId_key" ON "WalletEntry"("requestLogId");
ALTER TABLE "WalletEntry" ADD CONSTRAINT "WalletEntry_requestLogId_fkey"
  FOREIGN KEY ("requestLogId") REFERENCES "RequestLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "EmailActionToken" (
    "id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "userId" TEXT,
    "tenantId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "targetEmail" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailActionToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailActionToken_tokenHash_key" ON "EmailActionToken"("tokenHash");
CREATE INDEX "EmailActionToken_purpose_userId_expiresAt_idx" ON "EmailActionToken"("purpose", "userId", "expiresAt");
CREATE INDEX "EmailActionToken_purpose_tenantId_expiresAt_idx" ON "EmailActionToken"("purpose", "tenantId", "expiresAt");
CREATE INDEX "EmailActionToken_expiresAt_idx" ON "EmailActionToken"("expiresAt");

ALTER TABLE "EmailActionToken" ADD CONSTRAINT "EmailActionToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailActionToken" ADD CONSTRAINT "EmailActionToken_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "EmailDelivery" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "status" "EmailDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmailDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailDelivery_dedupeKey_key" ON "EmailDelivery"("dedupeKey");
CREATE INDEX "EmailDelivery_tenantId_createdAt_idx" ON "EmailDelivery"("tenantId", "createdAt" DESC);
CREATE INDEX "EmailDelivery_status_updatedAt_idx" ON "EmailDelivery"("status", "updatedAt");
ALTER TABLE "EmailDelivery" ADD CONSTRAINT "EmailDelivery_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
