import { Prisma } from "@prisma/client";
import { getIntegration } from "@/lib/server/integrations";
import { completePayment, decryptWechatResource, verifyWechatSignature } from "@/lib/server/payments";
import { isRequestBodyTooLarge, readLimitedText } from "@/lib/server/request";

export async function POST(request: Request) {
  let body: string;
  try { body = await readLimitedText(request, 1024 * 1024); }
  catch (error) { return Response.json({ code: "FAIL", message: isRequestBodyTooLarge(error) ? "通知内容过大" : "通知格式错误" }, { status: isRequestBodyTooLarge(error) ? 413 : 400 }); }
  const timestamp = request.headers.get("wechatpay-timestamp") ?? ""; const nonce = request.headers.get("wechatpay-nonce") ?? ""; const signature = request.headers.get("wechatpay-signature") ?? ""; const serial = request.headers.get("wechatpay-serial") ?? "";
  const config = await getIntegration("wechat", true); if (!config.enabled || serial !== String(config.publicConfig.platformSerialNo) || !verifyWechatSignature({ timestamp, nonce, body, signature, publicKey: String(config.secrets.platformPublicKey ?? "") })) return Response.json({ code: "FAIL", message: "签名验证失败" }, { status: 401 });
  try { const payload = JSON.parse(body) as { event_type: string; resource: { ciphertext: string; nonce: string; associated_data?: string } }; const transaction = decryptWechatResource(payload.resource, String(config.secrets.apiV3Key)); if (payload.event_type !== "TRANSACTION.SUCCESS" || transaction.trade_state !== "SUCCESS") throw new Error("NOT_SUCCESS"); await completePayment(transaction.out_trade_no, transaction.transaction_id, new Prisma.Decimal(transaction.amount.total).div(100)); return Response.json({ code: "SUCCESS", message: "成功" }); } catch { return Response.json({ code: "FAIL", message: "通知处理失败" }, { status: 409 }); }
}
