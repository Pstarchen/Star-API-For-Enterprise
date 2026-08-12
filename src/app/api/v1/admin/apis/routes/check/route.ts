import { z } from "zod";
import { normalizePublicHost, normalizePublicPath } from "@/lib/api-routes";
import { getCurrentUser, getCurrentWorkspace } from "@/lib/server/auth";
import { findRouteConflict, findSlugConflict } from "@/lib/server/api-routing";
import { noStoreHeaders } from "@/lib/server/request";

const pathSchema = z.string().trim().max(180).regex(/^\/(?:[A-Za-z0-9._~!$&'()*+,;=:@%{}-]+\/?)*$/, "公开路径格式不正确").transform(normalizePublicPath);
const querySchema = z.object({
  host: z.string().trim().min(1).max(253).transform(normalizePublicHost),
  path: pathSchema,
  version: z.string().trim().min(1).max(24).regex(/^[A-Za-z0-9._-]+$/),
  methods: z.string().transform((value, context) => {
    const methods = value.split(",").map((item) => item.trim()).filter(Boolean);
    if (!methods.length || methods.some((method) => !["GET", "POST", "PUT", "PATCH", "DELETE", "ALL"].includes(method))) {
      context.addIssue({ code: "custom", message: "请求方法不正确" });
      return z.NEVER;
    }
    return methods;
  }),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
}).strict();

async function apiManagerAccess() {
  const user = await getCurrentUser();
  if (!user) return "unauthenticated" as const;
  if (user.platformRole === "ADMIN") return "allowed" as const;
  const workspace = await getCurrentWorkspace(user);
  return workspace && workspace.tenant.type === "ENTERPRISE" && ["OWNER", "ADMIN"].includes(workspace.role) ? "allowed" as const : "forbidden" as const;
}

export async function GET(request: Request) {
  const access = await apiManagerAccess();
  if (access === "unauthenticated") return Response.json({ code: 401, message: "请先登录" }, { status: 401, headers: noStoreHeaders });
  if (access === "forbidden") return Response.json({ code: 403, message: "当前账号没有 API 管理权限" }, { status: 403, headers: noStoreHeaders });
  const values = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = querySchema.safeParse(values);
  if (!parsed.success) return Response.json({ code: 400, message: "路由检查参数不正确", details: z.flattenError(parsed.error) }, { status: 400, headers: noStoreHeaders });
  const route = parsed.data;
  const [routeConflict, slugConflict] = await Promise.all([
    findRouteConflict({ publicHost: route.host, publicPath: route.path, routeVersion: route.version, methods: route.methods }),
    route.slug ? findSlugConflict(route.slug) : null,
  ]);
  const available = !routeConflict && !slugConflict;
  return Response.json({
    code: 200,
    message: available ? "路由和标识均可使用" : routeConflict ? "公开路由与现有 API 冲突" : "API 唯一标识已被使用",
    data: {
      available,
      routeAvailable: !routeConflict,
      slugAvailable: !slugConflict,
      normalized: { publicHost: route.host, publicPath: route.path, routeVersion: route.version, methods: route.methods },
      conflict: routeConflict ? { type: "route", apiId: routeConflict.version.product.id, apiName: routeConflict.version.product.name, apiSlug: routeConflict.version.product.slug, methods: routeConflict.methods, publicPath: routeConflict.publicPath } : slugConflict ? { type: "slug", apiId: slugConflict.id, apiName: slugConflict.name, apiSlug: slugConflict.slug } : null,
    },
  }, { headers: noStoreHeaders });
}
