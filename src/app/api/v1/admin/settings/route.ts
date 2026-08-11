import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { normalizePublicPath, publicHostFromUrl } from "@/lib/api-routes";
import { getCurrentUser } from "@/lib/server/auth";
import { parseHeroDataUrl, parseIconDataUrl } from "@/lib/server/branding";
import { getPlatformConfig, PLATFORM_SETTING_KEY } from "@/lib/server/installation";
import { prisma } from "@/lib/server/prisma";
import { noStoreHeaders, requestIp } from "@/lib/server/request";

const settingsSchema = z.object({
  name: z.string().trim().min(2, "平台名称至少需要 2 个字符").max(40),
  description: z.string().trim().min(10, "网站介绍至少需要 10 个字符").max(500),
  publicUrl: z.url("请输入完整访问地址")
    .refine((value) => value.startsWith("https://") || value.startsWith("http://"), "访问地址必须使用 HTTP 或 HTTPS")
    .transform((value) => value.replace(/\/+$/, "")),
  icpNumber: z.string().trim().max(80).default(""),
  publicSecurityNumber: z.string().trim().max(100).default(""),
  iconAction: z.enum(["keep", "replace", "remove"]),
  iconDataUrl: z.string().max(750_000).optional(),
  heroAction: z.enum(["keep", "replace", "remove"]),
  heroDataUrl: z.string().max(7_500_000).optional(),
}).strict().superRefine((value, context) => {
  if (value.iconAction === "replace" && !value.iconDataUrl) {
    context.addIssue({ code: "custom", path: ["iconDataUrl"], message: "请选择要上传的网站图标" });
  }
  if (value.heroAction === "replace" && !value.heroDataUrl) context.addIssue({ code: "custom", path: ["heroDataUrl"], message: "请选择要上传的首屏图片" });
});

async function authorizeAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: Response.json({ code: 401, message: "请先登录" }, { status: 401, headers: noStoreHeaders }) } as const;
  if (user.platformRole !== "ADMIN") return { error: Response.json({ code: 403, message: "仅平台管理员可以修改此配置" }, { status: 403, headers: noStoreHeaders }) } as const;
  return { user } as const;
}

function sameOriginPublicPath(value: string) {
  const path = normalizePublicPath(value);
  if (path === "/api" || path.startsWith("/api/")) return path;
  return path === "/" ? "/api" : `/api${path}`;
}

export async function GET() {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;
  return Response.json({ data: await getPlatformConfig() }, { headers: noStoreHeaders });
}

export async function PATCH(request: Request) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  const parsed = settingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ code: 400, message: "平台配置不完整", details: z.flattenError(parsed.error) }, { status: 400, headers: noStoreHeaders });
  }

  let icon: ReturnType<typeof parseIconDataUrl> = null;
  let hero: ReturnType<typeof parseHeroDataUrl> = null;
  try {
    if (parsed.data.iconAction === "replace") icon = parseIconDataUrl(parsed.data.iconDataUrl);
    if (parsed.data.heroAction === "replace") hero = parseHeroDataUrl(parsed.data.heroDataUrl);
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_HERO_DIMENSIONS") {
      return Response.json({ code: 400, message: "首屏图片尺寸不能小于 960 × 480 像素" }, { status: 400, headers: noStoreHeaders });
    }
    if (error instanceof Error && ["UNSUPPORTED_ICON", "INVALID_IMAGE_SIZE", "INVALID_ICON_CONTENT"].includes(error.message)) {
      return Response.json({ code: 400, message: "图片格式或大小不正确；图标最大 512 KB，首屏图片最大 5 MB" }, { status: 400, headers: noStoreHeaders });
    }
    throw error;
  }

  let migratedRouteCount = 0;
  try {
    await prisma.$transaction(async (transaction) => {
      const setting = await transaction.platformSetting.findUnique({ where: { key: PLATFORM_SETTING_KEY } });
      if (!setting) throw new Error("PLATFORM_NOT_INSTALLED");

      const previous = setting.value && typeof setting.value === "object" && !Array.isArray(setting.value)
        ? setting.value as Prisma.JsonObject
        : {};
      const hasCustomIcon = parsed.data.iconAction === "replace"
        ? true
        : parsed.data.iconAction === "remove" ? false : previous.hasCustomIcon === true;
      const hasCustomHero = parsed.data.heroAction === "replace"
        ? true
        : parsed.data.heroAction === "remove" ? false : previous.hasCustomHero === true;
      const previousPublicUrl = typeof previous.publicUrl === "string" ? previous.publicUrl : "";
      const previousHost = publicHostFromUrl(previousPublicUrl, "");
      const nextHost = publicHostFromUrl(parsed.data.publicUrl);

      if (parsed.data.iconAction === "replace" && icon) {
        await transaction.platformAsset.upsert({
          where: { key: "site-icon" },
          create: { key: "site-icon", mimeType: icon.mimeType, data: icon.data },
          update: { mimeType: icon.mimeType, data: icon.data },
        });
      } else if (parsed.data.iconAction === "remove") {
        await transaction.platformAsset.deleteMany({ where: { key: "site-icon" } });
      }
      if (parsed.data.heroAction === "replace" && hero) {
        await transaction.platformAsset.upsert({ where: { key: "site-hero" }, create: { key: "site-hero", mimeType: hero.mimeType, data: hero.data }, update: { mimeType: hero.mimeType, data: hero.data } });
      } else if (parsed.data.heroAction === "remove") {
        await transaction.platformAsset.deleteMany({ where: { key: "site-hero" } });
      }

      if (previousHost && previousHost !== nextHost) {
        const defaultHosts = Array.from(new Set([
          previousHost,
          `api.${previousHost}`,
          `gateway.${previousHost}`,
          "localhost",
          "127.0.0.1",
          "api.localhost",
          "gateway.localhost",
        ]));
        const routes = await transaction.endpoint.findMany({
          where: { publicHost: { in: defaultHosts } },
          select: { id: true, publicPath: true, routeVersion: true, method: true },
        });
        const routeIds = new Set(routes.map((route) => route.id));
        const existingTargetRoutes = await transaction.endpoint.findMany({
          where: { publicHost: nextHost },
          select: { id: true, publicPath: true, routeVersion: true, method: true },
        });
        const targetKeys = new Set<string>();
        for (const route of existingTargetRoutes) {
          if (!routeIds.has(route.id)) targetKeys.add(`${nextHost}\u0000${route.publicPath}\u0000${route.routeVersion}\u0000${route.method}`);
        }
        for (const route of routes) {
          const publicPath = sameOriginPublicPath(route.publicPath);
          const key = `${nextHost}\u0000${publicPath}\u0000${route.routeVersion}\u0000${route.method}`;
          if (targetKeys.has(key)) throw new Error("PUBLIC_HOST_ROUTE_CONFLICT");
          targetKeys.add(key);
        }
        for (const route of routes) {
          await transaction.endpoint.update({
            where: { id: route.id },
            data: { publicHost: nextHost, publicPath: sameOriginPublicPath(route.publicPath) },
          });
        }
        migratedRouteCount = routes.length;
      }

      await transaction.platformSetting.update({
        where: { key: PLATFORM_SETTING_KEY },
        data: {
          value: {
            ...previous,
            name: parsed.data.name,
            description: parsed.data.description,
            publicUrl: parsed.data.publicUrl,
            icpNumber: parsed.data.icpNumber,
            publicSecurityNumber: parsed.data.publicSecurityNumber,
            hasCustomIcon,
            hasCustomHero,
            version: typeof previous.version === "number" ? previous.version + 1 : 2,
          },
        },
      });
      await transaction.auditLog.create({
        data: {
          tenantId: auth.user.memberships[0]?.tenantId,
          actorId: auth.user.id,
          action: "platform.settings.update",
          resource: "platform",
          resourceId: PLATFORM_SETTING_KEY,
          metadata: {
            previousName: typeof previous.name === "string" ? previous.name : null,
            name: parsed.data.name,
            previousPublicUrl,
            publicUrl: parsed.data.publicUrl,
            migratedRouteCount,
            iconAction: parsed.data.iconAction,
            heroAction: parsed.data.heroAction,
          },
          ipAddress: requestIp(request),
        },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "PLATFORM_NOT_INSTALLED") {
      return Response.json({ code: 409, message: "平台尚未完成初始化" }, { status: 409, headers: noStoreHeaders });
    }
    if (error instanceof Error && error.message === "PUBLIC_HOST_ROUTE_CONFLICT") {
      return Response.json({ code: 409, message: "新访问域名下存在重复 API 路由，请先处理冲突后再修改" }, { status: 409, headers: noStoreHeaders });
    }
    return Response.json({ code: 500, message: "平台配置保存失败，请稍后重试" }, { status: 500, headers: noStoreHeaders });
  }

  revalidatePath("/", "layout");
  return Response.json({ code: 200, message: migratedRouteCount ? `平台配置已保存，已同步 ${migratedRouteCount} 条 API 路由` : "平台配置已保存", data: await getPlatformConfig() }, { headers: noStoreHeaders });
}
