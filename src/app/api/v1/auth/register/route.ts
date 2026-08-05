import { z } from "zod";

const registrationSchema = z.object({
  accountType: z.enum(["personal", "enterprise"]),
  name: z.string().trim().min(2, "姓名至少需要 2 个字符").max(40),
  email: z.email("请输入有效邮箱地址"),
  password: z.string().min(8, "密码至少需要 8 个字符").max(72),
  companyName: z.string().trim().max(100).optional(),
  acceptedTerms: z.literal(true),
}).superRefine((data, context) => {
  if (data.accountType === "enterprise" && !data.companyName) {
    context.addIssue({ code: "custom", path: ["companyName"], message: "企业账号需要填写企业名称" });
  }
});

export async function POST(request: Request) {
  const parsed = registrationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ code: 400, message: "注册信息不完整", details: z.flattenError(parsed.error) }, { status: 400 });
  }

  const { accountType, name, email, companyName } = parsed.data;
  const workspaceName = accountType === "enterprise" ? companyName! : `${name}的个人空间`;

  return Response.json({
    code: 201,
    message: "账号创建成功",
    data: {
      user: { id: `usr_${crypto.randomUUID().slice(0, 8)}`, name, email, accountType },
      workspace: { id: `wsp_${crypto.randomUUID().slice(0, 8)}`, name: workspaceName, type: accountType },
      nextStep: accountType === "enterprise" ? "VERIFY_ENTERPRISE" : "CREATE_API_KEY",
    },
  }, { status: 201, headers: { "Cache-Control": "no-store", "X-Demo-Mode": "true" } });
}
