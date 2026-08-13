ALTER TABLE "PaymentOrder"
ADD COLUMN "paymentQrCode" TEXT,
ADD COLUMN "paymentScheme" TEXT;

ALTER TABLE "PaymentProvider"
ADD COLUMN "submissionMode" TEXT NOT NULL DEFAULT 'REDIRECT';
