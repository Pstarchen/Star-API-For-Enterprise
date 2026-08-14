import { Prisma } from "@prisma/client";
import { getIntegration } from "@/lib/server/integrations";
import { completePayment, verifyAlipayNotification } from "@/lib/server/payments";
import { isRequestBodyTooLarge, readLimitedFormData } from "@/lib/server/request";

export async function POST(request: Request) {
  let form: FormData;
  try { form = await readLimitedFormData(request, 1024 * 1024); }
  catch (error) { return new Response("failure", { status: isRequestBodyTooLarge(error) ? 413 : 400 }); }
  const params = Object.fromEntries(Array.from(form.entries()).map(([key, value]) => [key, String(value)]));
  const config = await getIntegration("alipay", true); const publicKey = String(config.secrets.alipayPublicKey ?? "");
  if (!config.enabled || !publicKey || !verifyAlipayNotification(params, publicKey) || params.trade_status !== "TRADE_SUCCESS") return new Response("failure", { status: 400 });
  try { await completePayment(params.out_trade_no, params.trade_no, new Prisma.Decimal(params.total_amount)); return new Response("success"); } catch { return new Response("failure", { status: 409 }); }
}
