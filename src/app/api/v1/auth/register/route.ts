import { Prisma } from "@prisma/client";
import { z } from "zod";
import { createSession } from "@/lib/server/auth";
import { hashPassword } from "@/lib/server/password";
import { isInstalled } from "@/lib/server/installation";
import { prisma } from "@/lib/server/prisma";
import { noStoreHeaders, requestIp } from "@/lib/server/request";

const registrationSchema = z.object({
  accountType: z.enum(["personal", "enterprise"]),
  name: z.string().trim().min(2, "姓名至少需要 2 个字符").max(40),
  email: z.email("请输入有效邮箱地址").transform((value) => value.trim().toLowerCase()),
  password: z.string()
    .min(10, "密码至少需要 10 个字符")
    .max(72)
    .regex(/[A-Za-z]/, "密码需要包含字母")
    .regex(/[0-9]/, "密码需要包含数字"),
  companyName: z.string().trim().max(100).optional(),
  acceptedTerms: z.literal(true),
}).superRefine((data, context) => {
  if (data.accountType === "enterprise" && !data.companyName) {
    context.addIssue({ code: "custom", path: ["companyName"], message: "企业账号需要填写企业名称" });
  }
});

export async function POST(request: Request) {
  if (!(await isInstalled())) {
    return Response.json({ code: 503, message: "平台尚未完成初始化", data: { next: "/install" } }, { status: 503, headers: noStoreHeaders });
  }
  const parsed = registrationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { code: 400, message: "注册信息不完整", details: z.flattenError(parsed.error) },
      { status: 400, headers: noStoreHeaders },
    );
  }

  const { accountType, name, email, password, companyName } = parsed.data;
  const workspaceName = accountType === "enterprise" ? companyName! : `${name}的个人空间`;

  try {
    const passwordHash = await hashPassword(password);
    const result = await prisma.$transaction(async (transaction) => {
      const user = await transaction.user.create({
        data: {
          name,
          email,
          passwordHash,
          accountType: accountType === "enterprise" ? "ENTERPRISE" : "PERSONAL",
        },
      });
      const workspace = await transaction.tenant.create({
        data: {
          name: workspaceName,
          type: accountType === "enterprise" ? "ENTERPRISE" : "PERSONAL",
          status: accountType === "enterprise" ? "PENDING" : "ACTIVE",
        },
      });
      await transaction.membership.create({ data: { userId: user.id, tenantId: workspace.id, role: "OWNER" } });
      await transaction.auditLog.create({
        data: {
          actorId: user.id,
          tenantId: workspace.id,
          action: "auth.register",
          resource: "user",
          resourceId: user.id,
          ipAddress: requestIp(request),
          metadata: { accountType },
        },
      });
      return { user, workspace };
    });

    await createSession(result.user.id);
    return Response.json({
      code: 201,
      message: "账号创建成功",
      data: {
        user: { id: result.user.id, name: result.user.name, email: result.user.email, accountType },
        workspace: { id: result.workspace.id, name: result.workspace.name, type: accountType },
        nextStep: accountType === "enterprise" ? "VERIFY_ENTERPRISE" : "CREATE_API_KEY",
      },
    }, { status: 201, headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return Response.json({ code: 409, message: "该邮箱已注册，请直接登录" }, { status: 409, headers: noStoreHeaders });
    }
    return Response.json({ code: 500, message: "账号创建失败，请稍后重试" }, { status: 500, headers: noStoreHeaders });
  }
}
