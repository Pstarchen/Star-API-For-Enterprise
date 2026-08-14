CREATE TABLE "DirectLink" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenEncrypted" BYTEA NOT NULL,
    "defaultParameters" JSONB NOT NULL DEFAULT '{}',
    "status" "KeyStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DirectLink_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "RequestLog" ADD COLUMN "directLinkId" TEXT;

CREATE UNIQUE INDEX "DirectLink_tokenHash_key" ON "DirectLink"("tokenHash");
CREATE INDEX "DirectLink_subscriptionId_status_idx" ON "DirectLink"("subscriptionId", "status");
CREATE INDEX "DirectLink_endpointId_idx" ON "DirectLink"("endpointId");
CREATE INDEX "DirectLink_prefix_idx" ON "DirectLink"("prefix");
CREATE INDEX "RequestLog_directLinkId_occurredAt_idx" ON "RequestLog"("directLinkId", "occurredAt" DESC);

ALTER TABLE "DirectLink" ADD CONSTRAINT "DirectLink_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectLink" ADD CONSTRAINT "DirectLink_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "Endpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RequestLog" ADD CONSTRAINT "RequestLog_directLinkId_fkey" FOREIGN KEY ("directLinkId") REFERENCES "DirectLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;
