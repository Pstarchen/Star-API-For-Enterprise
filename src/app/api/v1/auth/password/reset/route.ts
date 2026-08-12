import { z } from "zod";
import { consumeEmailAction } from "@/lib/server/email-actions";
import { hashPassword } from "@/lib/server/password";
import { noStoreHeaders } from "@/lib/server/request";

const schema = z.object({
  token: z.string().trim().min(20).max(200),
  password: z.string().min(10).max(72).regex(/[A-Za-z]/).regex(/[0-9]/),
}).strict();

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: 400, message: "重置链接或新密码格式不正确" }, { status: 400, headers: noStoreHeaders });
  try {
    const passwordHash = await hashPassword(parsed.data.password);
    await consumeEmailAction({ purpose: "PASSWORD_RESET", raw: parsed.data.token }, async (transaction, record) => {
      if (!record.userId) throw new Error("EMAIL_ACTION_INVALID");
      await transaction.user.update({ where: { id: record.userId }, data: { passwordHash } });
      await transaction.session.deleteMany({ where: { userId: record.userId } });
      await transaction.auditLog.create({ data: { actorId: record.userId, action: "auth.password.reset", resource: "user", resourceId: record.userId } });
    });
    return Response.json({ code: 200, message: "密码已重置，请使用新密码登录" }, { headers: noStoreHeaders });
  } catch {
    return Response.json({ code: 409, message: "密码重置链接无效、已使用或已过期" }, { status: 409, headers: noStoreHeaders });
  }
}
