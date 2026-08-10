import { z } from "zod";
import { getCurrentUser } from "@/lib/server/auth";
import { canAdministratorsUseGithubLogin, getAuthPolicy, saveAuthPolicy } from "@/lib/server/auth-policy";
import { prisma } from "@/lib/server/prisma";
import { noStoreHeaders, requestIp } from "@/lib/server/request";

const schema = z.object({
  passwordLoginEnabled: z.boolean(),
  registrationEnabled: z.boolean(),
}).strict();

async function authorizeAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: Response.json({ code: 401, message: "请先登录" }, { status: 401, headers: noStoreHeaders }) } as const;
  if (user.platformRole !== "ADMIN") return { error: Response.json({ code: 403, message: "仅平台管理员可以修改登录策略" }, { status: 403, headers: noStoreHeaders }) } as const;
  return { user } as const;
}

export async function GET() {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;
  return Response.json({ data: await getAuthPolicy() }, { headers: noStoreHeaders });
}

export async function PATCH(request: Request) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ code: 400, message: "登录策略格式不正确", details: z.flattenError(parsed.error) }, { status: 400, headers: noStoreHeaders });
  }
  if (parsed.data.registrationEnabled && !parsed.data.passwordLoginEnabled) {
    return Response.json({ code: 409, message: "开放邮箱注册时必须同时启用邮箱密码登录" }, { status: 409, headers: noStoreHeaders });
  }
  if (!parsed.data.passwordLoginEnabled && !(await canAdministratorsUseGithubLogin())) {
    return Response.json({ code: 409, message: "关闭邮箱密码登录前，请先启用 GitHub 登录并让至少一名活跃管理员完成账号绑定" }, { status: 409, headers: noStoreHeaders });
  }

  const previous = await getAuthPolicy();
  await saveAuthPolicy(parsed.data);
  await prisma.auditLog.create({
    data: {
      tenantId: auth.user.memberships[0]?.tenantId,
      actorId: auth.user.id,
      action: "auth.policy.update",
      resource: "auth-policy",
      metadata: { previous, current: parsed.data },
      ipAddress: requestIp(request),
    },
  });
  return Response.json({ code: 200, message: "登录策略已保存", data: parsed.data }, { headers: noStoreHeaders });
}
