ALTER TABLE "PaymentProvider"
ADD COLUMN "protocolProfile" TEXT NOT NULL DEFAULT 'GENERIC_EPAY';

UPDATE "PaymentProvider"
SET "protocolProfile" = 'ID0_STANDARD',
    "paymentTypes" = array_remove("paymentTypes", 'qqpay')
WHERE "gatewayUrl" ~* '^https://pay\.id0\.cn(?:/|$)';
