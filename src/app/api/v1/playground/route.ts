import { z } from "zod";
import { apiProducts } from "@/lib/data";

const requestSchema = z.object({
  apiSlug: z.string().min(1).max(80),
  parameters: z.record(z.string(), z.unknown()).default({}),
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: 400, message: "请求参数格式不正确", details: z.treeifyError(parsed.error) }, { status: 400 });

  const api = apiProducts.find((item) => item.slug === parsed.data.apiSlug);
  if (!api) return Response.json({ code: 404, message: "未找到指定 API" }, { status: 404 });

  return Response.json({ code: 200, message: "ok", requestId: `req_${crypto.randomUUID().slice(0, 12)}`, data: { sandbox: true, api: api.name, received: parsed.data.parameters, status: "ACTIVE" }, meta: { latencyMs: api.latency, region: "cn-east-1" } }, { headers: { "Cache-Control": "no-store" } });
}
