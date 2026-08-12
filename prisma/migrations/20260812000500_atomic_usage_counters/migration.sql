CREATE TABLE "ApiUsageCounter" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "endpointId" TEXT,
    "scope" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "used" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiUsageCounter_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ApiUsageCounter_subscriptionId_scope_period_idx" ON "ApiUsageCounter"("subscriptionId", "scope", "period");
CREATE INDEX "ApiUsageCounter_endpointId_scope_period_idx" ON "ApiUsageCounter"("endpointId", "scope", "period");

ALTER TABLE "ApiUsageCounter" ADD CONSTRAINT "ApiUsageCounter_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApiUsageCounter" ADD CONSTRAINT "ApiUsageCounter_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "Endpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
