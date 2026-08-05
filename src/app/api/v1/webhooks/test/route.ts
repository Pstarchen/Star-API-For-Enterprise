import { createHmac } from "node:crypto";
import { z } from "zod";
import { getCurrentUser } from "@/lib/server/auth";
import { decryptJson } from "@/lib/server/encryption";
import { prisma } from "@/lib/server/prisma";
import { noStoreHeaders } from "@/lib/server/request";
import { assertSafeUpstream } from "@/lib/server/upstream";

const schema = z.object({ id: z.string().min(1) }).strict();

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ code: 401, message: "请先登录" }, { status: 401, headers: noStoreHeaders });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: 400, message: "Webhook 参数不正确" }, { status: 400, headers: noStoreHeaders });
  const endpoint = await prisma.webhookEndpoint.findFirst({ where: { id: parsed.data.id, app: { tenant: { memberships: { some: { userId: user.id } } } } } });
  if (!endpoint || !endpoint.enabled) return Response.json({ code: 404, message: "Webhook 不存在、已停用或无权访问" }, { status: 404, headers: noStoreHeaders });
  const secret = decryptJson(endpoint.secretEncrypted).secret;
  if (typeof secret !== "string") return Response.json({ code: 409, message: "Webhook 缺少可用签名密钥，请重新创建" }, { status: 409, headers: noStoreHeaders });
  try {
    await assertSafeUpstream(endpoint.url);
    const payload = JSON.stringify({ event: "webhook.test", endpointId: endpoint.id, occurredAt: new Date().toISOString() });
    const signature = createHmac("sha256", secret).update(payload).digest("hex");
    const response = await fetch(endpoint.url, { method: "POST", headers: { "Content-Type": "application/json", "X-Star-Event": "webhook.test", "X-Star-Signature": `sha256=${signature}` }, body: payload, redirect: "error", signal: AbortSignal.timeout(10000), cache: "no-store" });
    return Response.json({ code: response.ok ? 200 : 502, message: response.ok ? "测试事件投递成功" : `接收端返回 HTTP ${response.status}`, data: { statusCode: response.status } }, { status: response.ok ? 200 : 502, headers: noStoreHeaders });
  } catch { return Response.json({ code: 502, message: "测试投递失败，请检查地址和接收端状态" }, { status: 502, headers: noStoreHeaders }); }
}
