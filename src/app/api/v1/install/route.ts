import { Prisma } from "@prisma/client";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { createSession } from "@/lib/server/auth";
import { isInstalled, PLATFORM_SETTING_KEY } from "@/lib/server/installation";
import { hashPassword } from "@/lib/server/password";
import { prisma } from "@/lib/server/prisma";
import { noStoreHeaders, requestIp } from "@/lib/server/request";
import { parseIconDataUrl } from "@/lib/server/branding";
import { AUTH_POLICY_SETTING_KEY, defaultAuthPolicy } from "@/lib/server/auth-policy";

const installSchema = z.object({
  installToken: z.string().min(1),
  platformName: z.string().trim().min(2, "平台名称至少需要 2 个字符").max(40),
  platformDescription: z.string().trim().min(10, "网站介绍至少需要 10 个字符").max(500),
  publicUrl: z.url("请输入完整访问地址").refine((value) => value.startsWith("https://") || value.startsWith("http://"), "访问地址必须使用 HTTP 或 HTTPS"),
  iconDataUrl: z.string().max(750_000).optional(),
  adminName: z.string().trim().min(2, "管理员姓名至少需要 2 个字符").max(40),
  adminEmail: z.email("请输入有效邮箱地址").transform((value) => value.trim().toLowerCase()),
  adminPassword: z.string()
    .min(10, "管理员密码至少需要 10 个字符")
    .max(72)
    .regex(/[A-Za-z]/, "管理员密码需要包含字母")
    .regex(/[0-9]/, "管理员密码需要包含数字"),
});

function validInstallToken(candidate: string) {
  const expected = process.env.INSTALL_TOKEN;
  if (!expected || expected.length < 32) return false;
  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);
  return candidateBuffer.length === expectedBuffer.length && timingSafeEqual(candidateBuffer, expectedBuffer);
}

export async function GET() {
  return Response.json({ data: { installed: await isInstalled() } }, { headers: noStoreHeaders });
}

export async function POST(request: Request) {
  if (await isInstalled()) {
    return Response.json({ code: 409, message: "平台已经完成初始化" }, { status: 409, headers: noStoreHeaders });
  }

  const parsed = installSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ code: 400, message: "安装配置不完整", details: z.flattenError(parsed.error) }, { status: 400, headers: noStoreHeaders });
  }
  if (!validInstallToken(parsed.data.installToken)) {
    return Response.json({ code: 403, message: "部署令牌不正确" }, { status: 403, headers: noStoreHeaders });
  }

  const { platformName, platformDescription, publicUrl, adminName, adminEmail, adminPassword } = parsed.data;
  try {
    const icon = parseIconDataUrl(parsed.data.iconDataUrl);
    const passwordHash = await hashPassword(adminPassword);
    const user = await prisma.$transaction(async (transaction) => {
      await transaction.platformSetting.create({
        data: {
          key: PLATFORM_SETTING_KEY,
          value: { name: platformName, description: platformDescription, publicUrl, icpNumber: "", publicSecurityNumber: "", hasCustomIcon: Boolean(icon), hasCustomHero: false, phpPackageMaxMb: 16, installedAt: new Date().toISOString(), version: 1 },
        },
      });
      await transaction.platformSetting.create({
        data: { key: AUTH_POLICY_SETTING_KEY, value: defaultAuthPolicy },
      });
      if (icon) await transaction.platformAsset.create({ data: { key: "site-icon", mimeType: icon.mimeType, data: icon.data } });
      const admin = await transaction.user.create({
        data: {
          name: adminName,
          email: adminEmail,
          passwordHash,
          accountType: "PERSONAL",
          platformRole: "ADMIN",
          emailVerifiedAt: new Date(),
        },
      });
      const workspace = await transaction.tenant.create({
        data: { name: `${adminName}的管理空间`, type: "PERSONAL", status: "ACTIVE", plan: "admin" },
      });
      await transaction.membership.create({ data: { userId: admin.id, tenantId: workspace.id, role: "OWNER" } });
      await transaction.auditLog.create({
        data: {
          tenantId: workspace.id,
          actorId: admin.id,
          action: "platform.install",
          resource: "platform",
          resourceId: PLATFORM_SETTING_KEY,
          ipAddress: requestIp(request),
        },
      });
      return admin;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    await createSession(user.id);
    return Response.json({ code: 201, message: "平台初始化完成", data: { next: "/admin" } }, { status: 201, headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof Error && ["UNSUPPORTED_ICON", "INVALID_IMAGE_SIZE", "INVALID_ICON_CONTENT"].includes(error.message)) {
      return Response.json({ code: 400, message: "网站图标格式不正确，请使用 512 KB 内的 PNG、JPEG、WebP 或 ICO" }, { status: 400, headers: noStoreHeaders });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return Response.json({ code: 409, message: "平台已初始化或管理员邮箱已存在" }, { status: 409, headers: noStoreHeaders });
    }
    return Response.json({ code: 500, message: "初始化失败，请检查数据库状态后重试" }, { status: 500, headers: noStoreHeaders });
  }
}
