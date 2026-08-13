-- AlterEnum
ALTER TYPE "PaymentChannel" ADD VALUE 'EPAY';

-- CreateEnum
CREATE TYPE "PaymentProviderHealthStatus" AS ENUM ('UNKNOWN', 'HEALTHY', 'UNHEALTHY');

-- CreateTable
CREATE TABLE "PaymentProvider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gatewayUrl" TEXT NOT NULL,
    "merchantPid" TEXT NOT NULL,
    "merchantKeyEncrypted" BYTEA NOT NULL,
    "paymentTypes" TEXT[] NOT NULL,
    "feeRate" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "minAmount" DECIMAL(14,2) NOT NULL DEFAULT 0.01,
    "maxAmount" DECIMAL(14,2) NOT NULL DEFAULT 100000000,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "healthStatus" "PaymentProviderHealthStatus" NOT NULL DEFAULT 'UNKNOWN',
    "lastTestedAt" TIMESTAMP(3),
    "lastTestMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentProvider_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "PaymentOrder"
ADD COLUMN "paymentProviderId" TEXT,
ADD COLUMN "providerNameSnapshot" TEXT,
ADD COLUMN "paymentType" TEXT;

-- CreateIndex
CREATE INDEX "PaymentProvider_enabled_sortOrder_createdAt_idx" ON "PaymentProvider"("enabled", "sortOrder", "createdAt");
CREATE INDEX "PaymentProvider_healthStatus_lastTestedAt_idx" ON "PaymentProvider"("healthStatus", "lastTestedAt");
CREATE INDEX "PaymentOrder_paymentProviderId_createdAt_idx" ON "PaymentOrder"("paymentProviderId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "PaymentOrder" ADD CONSTRAINT "PaymentOrder_paymentProviderId_fkey" FOREIGN KEY ("paymentProviderId") REFERENCES "PaymentProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
