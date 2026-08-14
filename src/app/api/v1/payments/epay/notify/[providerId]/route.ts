import { Prisma } from "@prisma/client";
import { verifyEpaySignature } from "@/lib/epay";
import { paymentProviderSecret } from "@/lib/server/payment-providers";
import { completePayment } from "@/lib/server/payments";
import { prisma } from "@/lib/server/prisma";
import { readLimitedFormData, readLimitedJson } from "@/lib/server/request";

type RouteContext = { params: Promise<{ providerId: string }> };

async function callbackParams(request: Request) {
  if (request.method === "GET") return Object.fromEntries(new URL(request.url).searchParams.entries());
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("application/json")) {
    const value = await readLimitedJson(request, 1024 * 1024).catch(() => null);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, typeof item === "string" ? item : String(item ?? "")]));
  }
  const form = await readLimitedFormData(request, 1024 * 1024).catch(() => null);
  return form ? Object.fromEntries(Array.from(form.entries()).map(([key, value]) => [key, String(value)])) : {};
}

async function handle(request: Request, context: RouteContext) {
  const { providerId } = await context.params;
  const values = await callbackParams(request);
  const provider = await prisma.paymentProvider.findUnique({ where: { id: providerId } });
  if (!provider) return new Response("fail", { status: 404 });

  const orderNo = values.out_trade_no?.trim() ?? "";
  const tradeNo = values.trade_no?.trim() ?? "";
  const paymentType = values.type?.trim() ?? "";
  let merchantKey: string;
  try {
    merchantKey = paymentProviderSecret(provider);
  } catch {
    return new Response("fail", { status: 409 });
  }
  if (
    values.sign_type?.toUpperCase() !== "MD5" ||
    values.trade_status !== "TRADE_SUCCESS" ||
    values.pid !== provider.merchantPid ||
    !orderNo || orderNo.length > 100 ||
    !tradeNo || tradeNo.length > 160 ||
    !verifyEpaySignature(values, merchantKey)
  ) return new Response("fail", { status: 400 });

  let amount: Prisma.Decimal;
  try {
    amount = new Prisma.Decimal(values.money);
  } catch {
    return new Response("fail", { status: 400 });
  }
  if (amount.lte(0) || amount.decimalPlaces() > 2) return new Response("fail", { status: 400 });

  const order = await prisma.paymentOrder.findUnique({ where: { orderNo }, select: { channel: true, paymentProviderId: true, paymentType: true, amount: true } });
  if (!order || order.channel !== "EPAY" || order.paymentProviderId !== provider.id || order.paymentType !== paymentType || order.amount.comparedTo(amount) !== 0) return new Response("fail", { status: 409 });

  try {
    await completePayment(orderNo, tradeNo, amount, { note: `易支付服务商：${provider.name}` });
    return new Response("success", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  } catch {
    return new Response("fail", { status: 409, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}

export async function GET(request: Request, context: RouteContext) {
  return handle(request, context);
}

export async function POST(request: Request, context: RouteContext) {
  return handle(request, context);
}
