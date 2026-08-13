import { z } from "zod";
import { getCurrentUser } from "@/lib/server/auth";
import { paymentProviderView, testPaymentProvider } from "@/lib/server/payment-providers";
import { noStoreHeaders } from "@/lib/server/request";

const schema = z.object({ id: z.string().min(1) }).strict();

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ code: 401, message: "请先登录" }, { status: 401, headers: noStoreHeaders });
  if (user.platformRole !== "ADMIN") return Response.json({ code: 403, message: "仅平台管理员可以测试支付服务商" }, { status: 403, headers: noStoreHeaders });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: 400, message: "服务商 ID 不正确" }, { status: 400, headers: noStoreHeaders });
  try {
    const provider = await testPaymentProvider(parsed.data.id);
    return Response.json({ code: 200, message: provider.lastTestMessage, data: paymentProviderView(provider) }, { headers: noStoreHeaders });
  } catch (error) {
    const code = error instanceof Error ? error.message : "EPAY_GATEWAY_UNAVAILABLE";
    const message = code === "EPAY_PROVIDER_NOT_FOUND" ? "支付服务商不存在" : code === "PRIVATE_UPSTREAM_BLOCKED" ? "支付网关解析到了内网或保留地址" : "支付网关连接失败，请检查地址、证书和网络";
    return Response.json({ code: code === "EPAY_PROVIDER_NOT_FOUND" ? 404 : 502, message }, { status: code === "EPAY_PROVIDER_NOT_FOUND" ? 404 : 502, headers: noStoreHeaders });
  }
}
