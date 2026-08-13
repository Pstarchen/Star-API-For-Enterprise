import { z } from "zod";
import { epayPaymentTypes, epaySubmissionModes } from "@/lib/payment-options";
import { getCurrentUser } from "@/lib/server/auth";
import { createPaymentProvider, paymentProviderView, updatePaymentProvider } from "@/lib/server/payment-providers";
import { prisma } from "@/lib/server/prisma";
import { noStoreHeaders, requestIp } from "@/lib/server/request";

const inputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  gatewayUrl: z.url().max(500),
  merchantPid: z.string().trim().min(1).max(100),
  merchantKey: z.string().trim().min(1).max(500).optional(),
  paymentTypes: z.array(z.enum(epayPaymentTypes)).min(1).max(epayPaymentTypes.length),
  submissionMode: z.enum(epaySubmissionModes).default("REDIRECT"),
  feeRate: z.string().regex(/^\d{1,3}(\.\d{1,4})?$/),
  minAmount: z.string().regex(/^\d{1,9}(\.\d{1,2})?$/),
  maxAmount: z.string().regex(/^\d{1,9}(\.\d{1,2})?$/),
  sortOrder: z.number().int().min(-10000).max(10000),
  enabled: z.boolean(),
  description: z.string().trim().max(500).optional(),
}).strict();
const updateSchema = inputSchema.extend({ id: z.string().min(1) }).strict();
const deleteSchema = z.object({ id: z.string().min(1) }).strict();

async function authorize() {
  const user = await getCurrentUser();
  if (!user) return { error: Response.json({ code: 401, message: "请先登录" }, { status: 401, headers: noStoreHeaders }) } as const;
  if (user.platformRole !== "ADMIN") return { error: Response.json({ code: 403, message: "仅平台管理员可以管理支付服务商" }, { status: 403, headers: noStoreHeaders }) } as const;
  return { user } as const;
}

function providerError(error: unknown) {
  const code = error instanceof Error ? error.message : "EPAY_PROVIDER_ERROR";
  const messages: Record<string, string> = {
    INVALID_EPAY_GATEWAY: "网关地址必须是无账号密码、查询参数和片段的 HTTP(S) 地址",
    PRIVATE_UPSTREAM_BLOCKED: "支付网关不能指向本机、内网或保留地址",
    EPAY_PROVIDER_INCOMPLETE: "服务商名称、商户 PID 和支付类型不能为空",
    EPAY_KEY_REQUIRED: "首次创建服务商必须填写商户密钥",
    EPAY_FEE_INVALID: "费率必须在 0% 到 100% 之间",
    EPAY_AMOUNT_RANGE_INVALID: "最低与最高支付金额范围不正确",
    EPAY_PROVIDER_NOT_FOUND: "支付服务商不存在",
    EPAY_PROVIDER_PENDING_CONFIG_LOCKED: "该服务商仍有待支付订单，请处理完成后再更换 PID 或商户密钥",
  };
  if (messages[code]) return messages[code];
  const cause = error instanceof Error && error.cause && typeof error.cause === "object" && "code" in error.cause ? String(error.cause.code) : "";
  if (["ENOTFOUND", "EAI_AGAIN"].includes(cause)) return "支付网关域名无法解析，请检查域名或服务器 DNS";
  return "支付服务商配置保存失败，请检查配置或稍后重试";
}

export async function GET() {
  const auth = await authorize(); if ("error" in auth) return auth.error;
  const providers = await prisma.paymentProvider.findMany({ include: { _count: { select: { orders: true } } }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  return Response.json({ code: 200, data: providers.map(paymentProviderView) }, { headers: noStoreHeaders });
}

export async function POST(request: Request) {
  const auth = await authorize(); if ("error" in auth) return auth.error;
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: 400, message: "支付服务商参数不正确", details: z.flattenError(parsed.error) }, { status: 400, headers: noStoreHeaders });
  try {
    const provider = await createPaymentProvider(parsed.data);
    await prisma.auditLog.create({ data: { tenantId: auth.user.memberships[0]?.tenantId, actorId: auth.user.id, action: "payment-provider.create", resource: "payment-provider", resourceId: provider.id, metadata: { name: provider.name, enabled: provider.enabled, paymentTypes: provider.paymentTypes }, ipAddress: requestIp(request) } });
    return Response.json({ code: 201, message: "易支付服务商已创建", data: paymentProviderView(provider) }, { status: 201, headers: noStoreHeaders });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const status = ["INVALID_EPAY_GATEWAY", "INVALID_UPSTREAM_URL", "PRIVATE_UPSTREAM_BLOCKED", "EPAY_PROVIDER_INCOMPLETE", "EPAY_KEY_REQUIRED", "EPAY_FEE_INVALID", "EPAY_AMOUNT_RANGE_INVALID"].includes(code) ? 400 : 502;
    return Response.json({ code: status, message: providerError(error) }, { status, headers: noStoreHeaders });
  }
}

export async function PATCH(request: Request) {
  const auth = await authorize(); if ("error" in auth) return auth.error;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: 400, message: "支付服务商参数不正确", details: z.flattenError(parsed.error) }, { status: 400, headers: noStoreHeaders });
  const { id, ...input } = parsed.data;
  try {
    const provider = await updatePaymentProvider(id, input);
    await prisma.auditLog.create({ data: { tenantId: auth.user.memberships[0]?.tenantId, actorId: auth.user.id, action: "payment-provider.update", resource: "payment-provider", resourceId: provider.id, metadata: { name: provider.name, enabled: provider.enabled, paymentTypes: provider.paymentTypes, merchantKeyChanged: Boolean(input.merchantKey) }, ipAddress: requestIp(request) } });
    return Response.json({ code: 200, message: "易支付服务商已保存", data: paymentProviderView(provider) }, { headers: noStoreHeaders });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const status = code === "EPAY_PROVIDER_NOT_FOUND" ? 404 : code === "EPAY_PROVIDER_PENDING_CONFIG_LOCKED" ? 409 : ["INVALID_EPAY_GATEWAY", "INVALID_UPSTREAM_URL", "PRIVATE_UPSTREAM_BLOCKED", "EPAY_PROVIDER_INCOMPLETE", "EPAY_FEE_INVALID", "EPAY_AMOUNT_RANGE_INVALID"].includes(code) ? 400 : 502;
    return Response.json({ code: status, message: providerError(error) }, { status, headers: noStoreHeaders });
  }
}

export async function DELETE(request: Request) {
  const auth = await authorize(); if ("error" in auth) return auth.error;
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: 400, message: "服务商 ID 不正确" }, { status: 400, headers: noStoreHeaders });
  const provider = await prisma.paymentProvider.findUnique({ where: { id: parsed.data.id }, include: { _count: { select: { orders: true } } } });
  if (!provider) return Response.json({ code: 404, message: "支付服务商不存在" }, { status: 404, headers: noStoreHeaders });
  if (provider._count.orders > 0) return Response.json({ code: 409, message: "该服务商已有历史订单，请停用后保留以便财务审计" }, { status: 409, headers: noStoreHeaders });
  await prisma.$transaction([
    prisma.paymentProvider.delete({ where: { id: provider.id } }),
    prisma.auditLog.create({ data: { tenantId: auth.user.memberships[0]?.tenantId, actorId: auth.user.id, action: "payment-provider.delete", resource: "payment-provider", resourceId: provider.id, metadata: { name: provider.name }, ipAddress: requestIp(request) } }),
  ]);
  return Response.json({ code: 200, message: "支付服务商已删除" }, { headers: noStoreHeaders });
}
