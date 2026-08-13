import { connection } from "next/server";
import { PaymentProvidersManager } from "@/components/payment-providers-manager";
import { paymentProviderView } from "@/lib/server/payment-providers";
import { prisma } from "@/lib/server/prisma";

export default async function AdminPaymentProvidersPage() {
  await connection();
  const providers = await prisma.paymentProvider.findMany({
    include: { _count: { select: { orders: true } } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return <PaymentProvidersManager initialProviders={providers.map(paymentProviderView)} />;
}
