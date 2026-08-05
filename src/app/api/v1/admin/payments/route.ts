import { z } from "zod";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/server/auth";
import { completePayment } from "@/lib/server/payments";
import { prisma } from "@/lib/server/prisma";
import { noStoreHeaders, requestIp } from "@/lib/server/request";

const schema = z.object({
  id: z.string().min(1),
  reference: z.string().trim().min(2).max(100),
  note: z.string().trim().max(300).optional(),
}).strict();

export async function PATCH(request: Request) {
  const admin = await getCurrentUser();
  if (!admin) return Response.json({ code: 401, message: "请先登录" }, { status: 401, headers: noStoreHeaders });
  if (admin.platformRole !== "ADMIN") return Response.json({ code: 403, message: "仅平台管理员可以核销订单" }, { status: 403, headers: noStoreHeaders });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: 400, message: "请填写有效的银行流水号" }, { status: 400, headers: noStoreHeaders });

  const order = await prisma.paymentOrder.findUnique({ where: { id: parsed.data.id } });
  if (!order) return Response.json({ code: 404, message: "支付订单不存在" }, { status: 404, headers: noStoreHeaders });
  if (order.channel !== "BANK_TRANSFER") return Response.json({ code: 409, message: "线上支付订单由支付回调自动确认" }, { status: 409, headers: noStoreHeaders });
  if (order.status !== "PENDING") return Response.json({ code: 409, message: "仅待支付的对公转账订单可以核销" }, { status: 409, headers: noStoreHeaders });

  try {
    const updated = await completePayment(order.orderNo, parsed.data.reference, new Prisma.Decimal(order.amount), {
      actorId: admin.id,
      ipAddress: requestIp(request),
      note: parsed.data.note,
    });
    return Response.json({ code: 200, message: "对公转账已确认到账", data: { id: updated.id, status: updated.status, paidAt: updated.paidAt?.toISOString() } }, { headers: noStoreHeaders });
  } catch {
    return Response.json({ code: 409, message: "订单或账单状态已变化，请刷新后重试" }, { status: 409, headers: noStoreHeaders });
  }
}
