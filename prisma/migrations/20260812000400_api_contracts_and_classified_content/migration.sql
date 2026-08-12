DROP INDEX IF EXISTS "Endpoint_versionId_method_path_key";
DROP INDEX IF EXISTS "Endpoint_publicHost_publicPath_routeVersion_method_key";

ALTER TABLE "Endpoint"
  ALTER COLUMN "method" TYPE TEXT[] USING ARRAY["method"];

ALTER TABLE "Endpoint" RENAME COLUMN "method" TO "methods";

ALTER TABLE "Endpoint"
  ADD COLUMN "responseFormats" TEXT[] NOT NULL DEFAULT ARRAY['JSON']::TEXT[],
  ADD COLUMN "responseExample" JSONB;

UPDATE "Endpoint"
SET "responseFormats" = CASE
  WHEN "schema"->>'contentType' LIKE 'text/plain%' THEN ARRAY['TXT']::TEXT[]
  WHEN "schema"->>'contentType' LIKE 'image/%' OR "schema"->>'contentType' LIKE 'video/%' OR "schema"->>'format' = 'binary' THEN ARRAY['BINARY']::TEXT[]
  ELSE ARRAY['JSON']::TEXT[]
END;

ALTER TABLE "ApiParameter"
  ADD COLUMN "description" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "defaultValue" TEXT;

ALTER TABLE "ApiAsset" ADD COLUMN "groupKey" TEXT NOT NULL DEFAULT '';

UPDATE "ApiProduct"
SET "executionConfig" = jsonb_set("executionConfig", '{dataset,grouping}', '"FILE"'::jsonb, true)
WHERE "internalHandler" = 'content.dataset'
  AND jsonb_typeof("executionConfig"->'dataset') = 'object'
  AND NOT ("executionConfig"->'dataset' ? 'grouping');

CREATE TABLE "ApiResponseParameter" (
  "id" TEXT NOT NULL,
  "endpointId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "dataType" TEXT NOT NULL DEFAULT 'string',
  "description" TEXT NOT NULL DEFAULT '',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ApiResponseParameter_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Endpoint_versionId_path_idx" ON "Endpoint"("versionId", "path");
CREATE INDEX "Endpoint_publicHost_publicPath_routeVersion_idx" ON "Endpoint"("publicHost", "publicPath", "routeVersion");
CREATE INDEX "ApiAsset_productId_kind_groupKey_idx" ON "ApiAsset"("productId", "kind", "groupKey");
CREATE UNIQUE INDEX "ApiResponseParameter_endpointId_name_key" ON "ApiResponseParameter"("endpointId", "name");
CREATE INDEX "ApiResponseParameter_endpointId_sortOrder_idx" ON "ApiResponseParameter"("endpointId", "sortOrder");

ALTER TABLE "ApiResponseParameter"
  ADD CONSTRAINT "ApiResponseParameter_endpointId_fkey"
  FOREIGN KEY ("endpointId") REFERENCES "Endpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
