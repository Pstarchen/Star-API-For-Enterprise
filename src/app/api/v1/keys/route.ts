import { z } from "zod";
import { issueApiKey } from "@/lib/server/api-key";

const keySchema = z.object({ appId: z.string().min(3).max(64), name: z.string().min(2).max(40), environment: z.enum(["test", "live"]), scopes: z.array(z.string().min(1).max(80)).max(30).default([]) });

export async function POST(request: Request) {
  const parsed = keySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: 400, message: "密钥参数不正确", details: z.treeifyError(parsed.error) }, { status: 400 });
  let key: ReturnType<typeof issueApiKey>;
  try {
    key = issueApiKey(parsed.data.environment);
  } catch {
    return Response.json({ code: 503, message: "密钥服务尚未完成安全配置" }, { status: 503 });
  }

  // The cleartext secret is returned once. Persist only key.secretHash after tenant authorization.
  return Response.json({ data: { id: crypto.randomUUID(), appId: parsed.data.appId, name: parsed.data.name, prefix: key.prefix, secret: key.secret, scopes: parsed.data.scopes, createdAt: new Date().toISOString() } }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
