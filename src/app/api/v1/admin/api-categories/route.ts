import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { listApiCategories } from "@/lib/server/api-categories";
import { getCurrentUser } from "@/lib/server/auth";
import { prisma } from "@/lib/server/prisma";
import { noStoreHeaders, requestIp } from "@/lib/server/request";

const fields = {
  name: z.string().trim().min(1, "分类名称不能为空").max(24),
  description: z.string().trim().max(120).default(""),
  sortOrder: z.coerce.number().int().min(0).max(10000).default(0),
  enabled: z.boolean().default(true),
};
const createSchema = z.object(fields).strict();
const updateSchema = z.object({ id: z.string().min(1), ...fields }).strict();
const deleteSchema = z.object({ id: z.string().min(1) }).strict();

async function administrator() {
  const user = await getCurrentUser();
  if (!user) return { error: Response.json({ code: 401, message: "请先登录" }, { status: 401, headers: noStoreHeaders }) } as const;
  if (user.platformRole !== "ADMIN") return { error: Response.json({ code: 403, message: "仅平台管理员可以管理 API 分类" }, { status: 403, headers: noStoreHeaders }) } as const;
  return { user } as const;
}

export async function GET() {
  const auth = await administrator();
  if ("error" in auth) return auth.error;
  return Response.json({ code: 200, data: await listApiCategories(true) }, { headers: noStoreHeaders });
}

export async function POST(request: Request) {
  const auth = await administrator();
  if ("error" in auth) return auth.error;
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: 400, message: "分类信息不正确", details: z.flattenError(parsed.error) }, { status: 400, headers: noStoreHeaders });
  try {
    const category = await prisma.$transaction(async (transaction) => {
      const created = await transaction.apiCategory.create({ data: parsed.data });
      await transaction.auditLog.create({ data: { tenantId: auth.user.memberships[0]?.tenantId, actorId: auth.user.id, action: "api-category.create", resource: "api-category", resourceId: created.id, metadata: { name: created.name }, ipAddress: requestIp(request) } });
      return created;
    });
    revalidatePath("/", "layout");
    return Response.json({ code: 201, message: "API 分类已创建", data: { ...category, productCount: 0 } }, { status: 201, headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ code: 409, message: "分类名称已存在" }, { status: 409, headers: noStoreHeaders });
    return Response.json({ code: 500, message: "API 分类创建失败" }, { status: 500, headers: noStoreHeaders });
  }
}

export async function PATCH(request: Request) {
  const auth = await administrator();
  if ("error" in auth) return auth.error;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: 400, message: "分类信息不正确", details: z.flattenError(parsed.error) }, { status: 400, headers: noStoreHeaders });
  try {
    await prisma.$transaction([
      prisma.apiCategory.update({ where: { id: parsed.data.id }, data: { name: parsed.data.name, description: parsed.data.description, sortOrder: parsed.data.sortOrder, enabled: parsed.data.enabled } }),
      prisma.auditLog.create({ data: { tenantId: auth.user.memberships[0]?.tenantId, actorId: auth.user.id, action: "api-category.update", resource: "api-category", resourceId: parsed.data.id, metadata: { name: parsed.data.name, enabled: parsed.data.enabled }, ipAddress: requestIp(request) } }),
    ]);
    revalidatePath("/", "layout");
    return Response.json({ code: 200, message: "API 分类已更新", data: await listApiCategories(true) }, { headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ code: 409, message: "分类名称已存在" }, { status: 409, headers: noStoreHeaders });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return Response.json({ code: 404, message: "API 分类不存在" }, { status: 404, headers: noStoreHeaders });
    return Response.json({ code: 500, message: "API 分类更新失败" }, { status: 500, headers: noStoreHeaders });
  }
}

export async function DELETE(request: Request) {
  const auth = await administrator();
  if ("error" in auth) return auth.error;
  const parsed = deleteSchema.safeParse({ id: new URL(request.url).searchParams.get("id") });
  if (!parsed.success) return Response.json({ code: 400, message: "缺少分类 ID" }, { status: 400, headers: noStoreHeaders });
  const category = await prisma.apiCategory.findUnique({ where: { id: parsed.data.id }, include: { _count: { select: { products: true } } } });
  if (!category) return Response.json({ code: 404, message: "API 分类不存在" }, { status: 404, headers: noStoreHeaders });
  if (category._count.products) return Response.json({ code: 409, message: `该分类下仍有 ${category._count.products} 个 API，请先调整分类` }, { status: 409, headers: noStoreHeaders });
  await prisma.$transaction([
    prisma.apiCategory.delete({ where: { id: category.id } }),
    prisma.auditLog.create({ data: { tenantId: auth.user.memberships[0]?.tenantId, actorId: auth.user.id, action: "api-category.delete", resource: "api-category", resourceId: category.id, metadata: { name: category.name }, ipAddress: requestIp(request) } }),
  ]);
  revalidatePath("/", "layout");
  return Response.json({ code: 200, message: "API 分类已删除" }, { headers: noStoreHeaders });
}
