-- Add wallet balances, recharge order types, and email verification tokens.
ALTER TYPE "PaymentChannel" ADD VALUE IF NOT EXISTS 'CODE_PAY';

CREATE TYPE "PaymentOrderType" AS ENUM ('INVOICE', 'RECHARGE');
CREATE TYPE "WalletEntryType" AS ENUM ('RECHARGE', 'REFUND', 'ADMIN_RECHARGE', 'ADMIN_REFUND');

ALTER TABLE "Tenant" ADD COLUMN "balance" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "PaymentOrder" ADD COLUMN "orderType" "PaymentOrderType" NOT NULL DEFAULT 'INVOICE';

CREATE TABLE "EmailVerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WalletEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "paymentOrderId" TEXT,
    "actorId" TEXT,
    "type" "WalletEntryType" NOT NULL,
    "delta" DECIMAL(14,2) NOT NULL,
    "balanceAfter" DECIMAL(14,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WalletEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");
CREATE INDEX "EmailVerificationToken_userId_expiresAt_idx" ON "EmailVerificationToken"("userId", "expiresAt");
CREATE INDEX "EmailVerificationToken_expiresAt_idx" ON "EmailVerificationToken"("expiresAt");
CREATE UNIQUE INDEX "WalletEntry_paymentOrderId_key" ON "WalletEntry"("paymentOrderId");
CREATE INDEX "WalletEntry_tenantId_createdAt_idx" ON "WalletEntry"("tenantId", "createdAt" DESC);
CREATE INDEX "WalletEntry_type_createdAt_idx" ON "WalletEntry"("type", "createdAt" DESC);

ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WalletEntry" ADD CONSTRAINT "WalletEntry_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WalletEntry" ADD CONSTRAINT "WalletEntry_paymentOrderId_fkey"
  FOREIGN KEY ("paymentOrderId") REFERENCES "PaymentOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WalletEntry" ADD CONSTRAINT "WalletEntry_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
