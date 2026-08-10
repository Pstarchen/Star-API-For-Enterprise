CREATE TABLE "ApiAsset" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiAsset_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ApiAsset_productId_kind_createdAt_idx" ON "ApiAsset"("productId", "kind", "createdAt");

ALTER TABLE "ApiAsset" ADD CONSTRAINT "ApiAsset_productId_fkey" FOREIGN KEY ("productId") REFERENCES "ApiProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
