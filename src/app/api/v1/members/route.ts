import { z } from "zod";
import { getCurrentUser, getCurrentWorkspace } from "@/lib/server/auth";
import { prisma } from "@/lib/server/prisma";
import { noStoreHeaders, requestIp } from "@/lib/server/request";

const roles = ["OWNER", "ADMIN", "DEVELOPER", "FINANCE", "AUDITOR"] as const;
const addSchema = z.object({ email: z.email().transform((value) => value.trim().toLowerCase()), role: z.enum(roles) }).strict();
const updateSchema = z.object({ id: z.string().min(1), role: z.enum(roles) }).strict();

async function context() {
  const user = await getCurrentUser();
  if (!user) return { error: Response.json({ code: 401, message: "请先登录" }, { status: 401, headers: noStoreHeaders }) } as const;
  const workspace = await getCurrentWorkspace(user);
  if (!workspace) return { error: Response.json({ code: 409, message: "当前账号没有工作区" }, { status: 409, headers: noStoreHeaders }) } as const;
  if (!['OWNER', 'ADMIN'].includes(workspace.role)) return { error: Response.json({ code: 403, message: "仅 Owner 或管理员可以管理成员" }, { status: 403, headers: noStoreHeaders }) } as const;
  return { user, workspace } as const;
}

export async function POST(request: Request) {
  const auth = await context(); if ("error" in auth) return auth.error;
  const parsed = addSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: 400, message: "成员邮箱或角色不正确" }, { status: 400, headers: noStoreHeaders });
  const target = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!target) return Response.json({ code: 404, message: "该邮箱尚未注册，请先让用户完成平台注册" }, { status: 404, headers: noStoreHeaders });
  try { const member = await prisma.membership.create({ data: { tenantId: auth.workspace.tenantId, userId: target.id, role: parsed.data.role }, include: { user: true } }); await prisma.auditLog.create({ data: { tenantId: auth.workspace.tenantId, actorId: auth.user.id, action: "membership.create", resource: "membership", resourceId: member.id, metadata: { userId: target.id, role: parsed.data.role }, ipAddress: requestIp(request) } }); return Response.json({ code: 201, message: "成员已添加", data: { id: member.id, role: member.role, createdAt: member.createdAt.toISOString(), user: { id: member.user.id, name: member.user.name, email: member.user.email, status: member.user.status, lastLoginAt: member.user.lastLoginAt?.toISOString() ?? null } } }, { status: 201, headers: noStoreHeaders }); }
  catch { return Response.json({ code: 409, message: "该用户已经是工作区成员" }, { status: 409, headers: noStoreHeaders }); }
}

export async function PATCH(request: Request) {
  const auth = await context(); if ("error" in auth) return auth.error;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: 400, message: "成员角色参数不正确" }, { status: 400, headers: noStoreHeaders });
  const member = await prisma.membership.findFirst({ where: { id: parsed.data.id, tenantId: auth.workspace.tenantId } });
  if (!member) return Response.json({ code: 404, message: "成员不存在" }, { status: 404, headers: noStoreHeaders });
  if (member.role === "OWNER" && parsed.data.role !== "OWNER" && await prisma.membership.count({ where: { tenantId: auth.workspace.tenantId, role: "OWNER" } }) <= 1) return Response.json({ code: 409, message: "工作区必须保留至少一个 Owner" }, { status: 409, headers: noStoreHeaders });
  await prisma.membership.update({ where: { id: member.id }, data: { role: parsed.data.role } });
  return Response.json({ code: 200, message: "成员角色已更新", data: { id: member.id, role: parsed.data.role } }, { headers: noStoreHeaders });
}

export async function DELETE(request: Request) {
  const auth = await context(); if ("error" in auth) return auth.error;
  const id = new URL(request.url).searchParams.get("id");
  const member = id ? await prisma.membership.findFirst({ where: { id, tenantId: auth.workspace.tenantId } }) : null;
  if (!member) return Response.json({ code: 404, message: "成员不存在" }, { status: 404, headers: noStoreHeaders });
  if (member.role === "OWNER" && await prisma.membership.count({ where: { tenantId: auth.workspace.tenantId, role: "OWNER" } }) <= 1) return Response.json({ code: 409, message: "不能移除工作区最后一个 Owner" }, { status: 409, headers: noStoreHeaders });
  await prisma.membership.delete({ where: { id: member.id } });
  return Response.json({ code: 200, message: "成员已移除" }, { headers: noStoreHeaders });
}
