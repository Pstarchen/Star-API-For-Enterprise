-- Store webhook signing secrets encrypted so delivery signatures can be generated.
-- This migration intentionally inserts no webhook or business records.
ALTER TABLE "WebhookEndpoint" ADD COLUMN "secretEncrypted" BYTEA;
