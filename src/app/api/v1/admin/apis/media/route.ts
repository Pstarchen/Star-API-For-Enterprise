import { revalidatePath } from "next/cache";
import { getCurrentUser, getCurrentWorkspace } from "@/lib/server/auth";
import { lockApiProduct } from "@/lib/server/api-product-lock";
import { mediaStorageLimits, removeStoredMedia, storeMediaArchiveRequest, storeMediaRequest, type MediaKind, type StoredMedia } from "@/lib/server/media-storage";
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
    EMPTY_MEDIA: "媒体文件不能为空",
    MEDIA_ARCHIVE_SIZE_LIMIT: `单个 ZIP 不能超过 ${Number(limits.maxArchiveBytes / BigInt(1024 ** 3))} GB`,
    MEDIA_ARCHIVE_EXPANDED_LIMIT: `ZIP 展开后不能超过 ${Number(limits.maxArchiveExpandedBytes / BigInt(1024 ** 3))} GB`,
    MEDIA_ARCHIVE_FILE_LIMIT: `单个 ZIP 最多包含 ${limits.maxFiles.toLocaleString("zh-CN")} 个文件`,
    EMPTY_MEDIA_ARCHIVE: "ZIP 中没有可导入的文件",
    INVALID_MEDIA_ARCHIVE: "ZIP 已损坏、加密或使用了不支持的压缩格式",
    INVALID_MEDIA_ARCHIVE_PATH: "ZIP 中包含不安全的文件路径",
    UNSUPPORTED_MEDIA_ARCHIVE_COMPRESSION: "ZIP 条目使用了不支持的压缩格式",
  };
  return messages[error.message] ?? "文件无法保存，请检查服务器存储空间";
}

function decodedFileName(value: string) {
  try { return decodeURIComponent(value); } catch { return value; }
}

function isArchive(name: string, contentType: string | null) {
  return name.toLowerCase().endsWith(".zip") || ["application/zip", "application/x-zip-compressed"].includes((contentType ?? "").toLowerCase());
}

async function persistMedia(input: {
  productId: string;
  kind: MediaKind;
  stored: StoredMedia;
  actorId: string;
  tenantId?: string;
  ipAddress: string | null;
}) {
  const limits = mediaStorageLimits();
  const asset = await prisma.$transaction(async (transaction) => {
    if (!(await lockApiProduct(transaction, input.productId))) throw new Error("API_NOT_FOUND");
    const duplicate = await transaction.apiAsset.findFirst({ where: { productId: input.productId, kind: input.kind, groupKey: input.stored.checksum } });
    if (duplicate) return duplicate;
    const [count, size] = await Promise.all([
      transaction.apiAsset.count({ where: { productId: input.productId, kind: input.kind } }),
      transaction.apiAsset.aggregate({ where: { productId: input.productId, kind: input.kind }, _sum: { size: true } }),
    ]);
    if (count >= limits.maxFiles) throw new Error("MEDIA_FILE_LIMIT");
    if ((size._sum.size ?? BigInt(0)) + input.stored.size > limits.maxApiBytes) throw new Error("MEDIA_API_LIMIT");
    const created = await transaction.apiAsset.create({ data: { productId: input.productId, kind: input.kind, name: input.stored.name, groupKey: input.stored.checksum, mimeType: input.stored.mimeType, data: Buffer.alloc(0), storageKey: input.stored.storageKey, size: input.stored.size } });
    await transaction.auditLog.create({ data: { tenantId: input.tenantId, actorId: input.actorId, action: `api.${input.kind.toLowerCase()}.add`, resource: "api-product", resourceId: input.productId, metadata: { assetId: created.id, name: created.name, bytes: Number(created.size) }, ipAddress: input.ipAddress } });
    return created;
  });
  return { asset, duplicate: asset.storageKey !== input.stored.storageKey };
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
  const name = decodedFileName(encodedName);
  const archive = isArchive(name, request.headers.get("content-type"));
  if (contentLength > (archive ? limits.maxArchiveBytes : limits.maxApiBytes)) return Response.json({ code: 409, message: uploadError(new Error(archive ? "MEDIA_ARCHIVE_SIZE_LIMIT" : "MEDIA_API_LIMIT")) }, { status: 409, headers: noStoreHeaders });
  const context = { productId, kind, actorId: auth.user.id, tenantId: auth.workspace?.tenantId, ipAddress: requestIp(request) };

  if (archive) {
    let extracted: Awaited<ReturnType<typeof storeMediaArchiveRequest>>;
    try {
      extracted = await storeMediaArchiveRequest({ productId, body: request.body, kind, maximumArchiveBytes: limits.maxArchiveBytes, maximumExpandedBytes: limits.maxArchiveExpandedBytes, maximumFiles: limits.maxFiles });
    } catch (error) {
      return Response.json({ code: 400, message: uploadError(error) }, { status: 400, headers: noStoreHeaders });
    }
    const summary = { archive: true, uploaded: 0, duplicates: 0, skipped: [] as Array<{ name: string; message: string }> };
    for (const item of extracted) {
      if (!item.stored) {
        summary.skipped.push({ name: item.name, message: uploadError(new Error(item.error ?? "INVALID_MEDIA_ARCHIVE")) });
        continue;
      }
      try {
        const persisted = await persistMedia({ ...context, stored: item.stored });
        if (persisted.duplicate) {
          summary.duplicates += 1;
          await removeStoredMedia(item.stored.storageKey).catch(() => undefined);
        } else summary.uploaded += 1;
      } catch (error) {
        await removeStoredMedia(item.stored.storageKey).catch(() => undefined);
        summary.skipped.push({ name: item.name, message: uploadError(error) });
      }
    }
    if (summary.uploaded) revalidatePath("/", "layout");
    return Response.json({ code: summary.uploaded ? 201 : 200, message: `ZIP 处理完成：上传 ${summary.uploaded} 个，重复 ${summary.duplicates} 个，跳过 ${summary.skipped.length} 个`, data: summary }, { status: summary.uploaded ? 201 : 200, headers: noStoreHeaders });
  }

  let stored: Awaited<ReturnType<typeof storeMediaRequest>> | null = null;
  try {
    stored = await storeMediaRequest({ productId, encodedName, body: request.body, kind, maximumBytes: limits.maxApiBytes, declaredMimeType: request.headers.get("content-type") ?? undefined });
    const { asset, duplicate } = await persistMedia({ ...context, stored });
    if (duplicate) {
      await removeStoredMedia(stored.storageKey).catch(() => undefined);
      return Response.json({ code: 200, message: `${kind === "VIDEO" ? "视频" : "图片"}“${stored.name}”已存在，已跳过重复上传`, data: { id: asset.id, kind: asset.kind, name: asset.name, mimeType: asset.mimeType, size: Number(asset.size), createdAt: asset.createdAt.toISOString(), preview: null, duplicate: true } }, { headers: noStoreHeaders });
    }
    revalidatePath("/", "layout");
    return Response.json({ code: 201, message: `${kind === "VIDEO" ? "视频" : "图片"}“${asset.name}”已上传`, data: { id: asset.id, kind: asset.kind, name: asset.name, mimeType: asset.mimeType, size: Number(asset.size), createdAt: asset.createdAt.toISOString(), preview: null } }, { status: 201, headers: noStoreHeaders });
  } catch (error) {
    if (stored) await removeStoredMedia(stored.storageKey).catch(() => undefined);
    return Response.json({ code: 400, message: uploadError(error) }, { status: 400, headers: noStoreHeaders });
  }
}
