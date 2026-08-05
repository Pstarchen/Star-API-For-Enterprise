-- Link real payment orders to issued invoices. No orders are inserted.
ALTER TABLE "PaymentOrder" ADD COLUMN "invoiceId" TEXT;
CREATE INDEX "PaymentOrder_invoiceId_createdAt_idx" ON "PaymentOrder"("invoiceId", "createdAt" DESC);
ALTER TABLE "PaymentOrder" ADD CONSTRAINT "PaymentOrder_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
