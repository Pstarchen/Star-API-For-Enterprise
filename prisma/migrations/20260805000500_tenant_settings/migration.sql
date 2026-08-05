-- Persist tenant-level notification preferences. No records are inserted.
ALTER TABLE "Tenant"
  ADD COLUMN "notificationEmail" TEXT,
  ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  ADD COLUMN "quotaAlerts" BOOLEAN NOT NULL DEFAULT true;
