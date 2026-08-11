ALTER TABLE "ApiAsset" ADD COLUMN "storageKey" TEXT;
ALTER TABLE "ApiAsset" ALTER COLUMN "size" TYPE BIGINT;
ALTER TABLE "RequestLog" ALTER COLUMN "responseBytes" TYPE BIGINT;

CREATE UNIQUE INDEX "ApiAsset_storageKey_key" ON "ApiAsset"("storageKey");
