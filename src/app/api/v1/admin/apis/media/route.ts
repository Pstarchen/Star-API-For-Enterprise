import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getCurrentUser, getCurrentWorkspace } from "@/lib/server/auth";
import { mediaStorageLimits, removeStoredMedia, storeMediaRequest, type MediaKind } from "@/lib/server/media-storage";
import { prisma } from "@/lib/server/prisma";
import { noStoreHeaders, requestIp } from "@/lib/server/request";

export const runtime = "nodejs";

async function manager() {
  const user = await getCurrentUser();
  if (!user) return { error: Response.json({ code: 401, message: "请先登录" }, { status: 401, headers: noStoreHeaders }) } as const;
  if (user.platformRole === "ADMIN") return { user, workspace: await getCurrentWorkspace(user), isAdmin: true } as const;
  const workspace = await getCurrentWorkspace(user);
  if (!workspace || workspace.tenant.type !== "ENTERPRISE" || !["OWNER", "ADMIN"].includes(workspace.role)) return { error: Response.json({ code: 403, message: "仅平台管理员或企业服务商管理员可以管理 API 媒体" }, { status: 403, headers: noStoreHeaders }) } as const;
  return { user, workspace, isAdmin: false } as const;
}

function uploadError(error: unknown) {
  if (!(error instanceof Error)) return "媒体上传失败";
  const limits = mediaStorageLimits();
  const messages: Record<string, string> = {
    MEDIA_API_LIMIT: `单个 API 的媒体总量不能超过 ${Number(limits.maxApiBytes / BigInt(1024 ** 3))} GB`,
    MEDIA_FILE_LIMIT: `单个 API 最多保存 ${limits.maxFiles.toLocaleString("zh-CN")} 个媒体文件`,
    UNSUPPORTED_IMAGE: "图片内容与扩展名不匹配，仅支持 PNG、JPEG、WebP 或 GIF",
    UNSUPPORTED_VIDEO: "视频内容与扩展名不匹配，仅支持 MP4、M4V、WebM、MOV、MKV 或 AVI",
    EMPTY_MEDIA: "媒体文件不能为空",
  };
  return messages[error.message] ?? "媒体上传失败，请检查服务器存储空间";
}

export async function GET() {
  const auth = await manager();
  if ("error" in auth) return auth.error;
  const limits = mediaStorageLimits();
  return Response.json({ code: 200, data: { maxApiBytes: Number(limits.maxApiBytes), maxFiles: limits.maxFiles } }, { headers: noStoreHeaders });
}

export async function POST(request: Request) {
  const auth = await manager();
  if ("error" in auth) return auth.error;
  const productId = new URL(request.url).searchParams.get("productId") ?? "";
  const encodedName = request.headers.get("x-file-name") ?? "";
  const rawLength = request.headers.get("content-length");
  const contentLength = rawLength && /^\d+$/.test(rawLength) ? BigInt(rawLength) : BigInt(0);
  if (!productId || !encodedName || !request.body) return Response.json({ code: 400, message: "媒体上传请求不完整" }, { status: 400, headers: noStoreHeaders });

  const product = await prisma.apiProduct.findUnique({ where: { id: productId }, select: { id: true, slug: true, internalHandler: true, provider: { select: { ownerTenantId: true } } } });
  const kind: MediaKind | null = product?.internalHandler === "content.random-image" ? "IMAGE" : product?.internalHandler === "content.random-video" ? "VIDEO" : null;
  if (!product || !kind) return Response.json({ code: 404, message: "随机图片或随机视频 API 不存在" }, { status: 404, headers: noStoreHeaders });
  if (!auth.isAdmin && product.provider.ownerTenantId !== auth.workspace.tenantId) return Response.json({ code: 403, message: "无权管理其他服务商的 API 媒体" }, { status: 403, headers: noStoreHeaders });

  const limits = mediaStorageLimits();
  const [currentCount, currentSize] = await Promise.all([
    prisma.apiAsset.count({ where: { productId, kind } }),
    prisma.apiAsset.aggregate({ where: { productId, kind }, _sum: { size: true } }),
  ]);
  const usedBytes = currentSize._sum.size ?? BigInt(0);
  if (currentCount >= limits.maxFiles) return Response.json({ code: 409, message: uploadError(new Error("MEDIA_FILE_LIMIT")) }, { status: 409, headers: noStoreHeaders });
  if (usedBytes + contentLength > limits.maxApiBytes) return Response.json({ code: 409, message: uploadError(new Error("MEDIA_API_LIMIT")) }, { status: 409, headers: noStoreHeaders });

  let stored: Awaited<ReturnType<typeof storeMediaRequest>> | null = null;
  try {
    stored = await storeMediaRequest({ productId, encodedName, body: request.body, kind, maximumBytes: limits.maxApiBytes - usedBytes });
    const asset = await prisma.$transaction(async (transaction) => {
      const [count, size] = await Promise.all([
        transaction.apiAsset.count({ where: { productId, kind } }),
        transaction.apiAsset.aggregate({ where: { productId, kind }, _sum: { size: true } }),
      ]);
      if (count >= limits.maxFiles) throw new Error("MEDIA_FILE_LIMIT");
      if ((size._sum.size ?? BigInt(0)) + stored!.size > limits.maxApiBytes) throw new Error("MEDIA_API_LIMIT");
      const created = await transaction.apiAsset.create({ data: { productId, kind, name: stored!.name, mimeType: stored!.mimeType, data: Buffer.alloc(0), storageKey: stored!.storageKey, size: stored!.size } });
      await transaction.auditLog.create({ data: { tenantId: auth.workspace?.tenantId, actorId: auth.user.id, action: `api.${kind.toLowerCase()}.add`, resource: "api-product", resourceId: productId, metadata: { assetId: created.id, name: created.name, bytes: Number(created.size) }, ipAddress: requestIp(request) } });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    revalidatePath("/", "layout");
    return Response.json({ code: 201, message: `${kind === "VIDEO" ? "视频" : "图片"}“${asset.name}”已上传`, data: { id: asset.id, kind: asset.kind, name: asset.name, mimeType: asset.mimeType, size: Number(asset.size), createdAt: asset.createdAt.toISOString(), preview: null } }, { status: 201, headers: noStoreHeaders });
  } catch (error) {
    if (stored) await removeStoredMedia(stored.storageKey).catch(() => undefined);
    return Response.json({ code: 400, message: uploadError(error) }, { status: 400, headers: noStoreHeaders });
  }
}
