import { z } from "zod";
import { createSession } from "@/lib/server/auth";
import { consumeEmailVerificationCode, consumeEmailVerificationToken } from "@/lib/server/email-verification";
import { noStoreHeaders } from "@/lib/server/request";

const schema = z.union([
  z.object({ token: z.string().trim().min(20).max(200) }).strict(),
  z.object({ email: z.email().transform((value) => value.trim().toLowerCase()), code: z.string().trim().regex(/^\d{6}$/) }).strict(),
]);

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: 400, message: "请输入有效邮箱和 6 位验证码" }, { status: 400, headers: noStoreHeaders });
  try {
    const user = "token" in parsed.data
      ? await consumeEmailVerificationToken(parsed.data.token)
      : await consumeEmailVerificationCode(parsed.data.email, parsed.data.code);
    try {
      await createSession(user.id, true);
    } catch {
      return Response.json({ code: 200, message: "邮箱验证成功，请返回登录页登录", data: { user: { id: user.id, name: user.name, email: user.email, platformRole: user.platformRole }, sessionCreated: false } }, { headers: noStoreHeaders });
    }
    return Response.json({ code: 200, message: "邮箱验证成功", data: { user: { id: user.id, name: user.name, email: user.email, platformRole: user.platformRole } } }, { headers: noStoreHeaders });
  } catch {
    return Response.json({ code: 409, message: "验证码无效、已使用或已过期" }, { status: 409, headers: noStoreHeaders });
  }
}
