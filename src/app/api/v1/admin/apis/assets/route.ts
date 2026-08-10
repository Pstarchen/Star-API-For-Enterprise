import { revalidatePath } from "next/cache";
import { getCurrentUser, getCurrentWorkspace } from "@/lib/server/auth";
import { assetErrorMessage, MAX_TOTAL_ASSET_BYTES, prepareApiAssets, preparePhpPackage } from "@/lib/server/api-assets";
import { isAssetBackedHandler, isContentHandler, phpHandlerId } from "@/lib/internal-handlers";
import { prisma } from "@/lib/server/prisma";
import { noStoreHeaders, requestIp } from "@/lib/server/request";

async function admin() {
  const user = await getCurrentUser();
  if (!user) return { error: Response.json({ code: 401, message: "请先登录" }, { status: 401, headers: noStoreHeaders }) } as const;
  if (user.platformRole === "ADMIN") return { user, workspace: await getCurrentWorkspace(user), isAdmin: true } as const;
  const workspace = await getCurrentWorkspace(user);
  if (!workspace || workspace.tenant.type !== "ENTERPRISE" || !["OWNER", "ADMIN"].includes(workspace.role)) return { error: Response.json({ code: 403, message: "仅平台管理员或企业服务商管理员可以管理 API 内容" }, { status: 403, headers: noStoreHeaders }) } as const;
  return { user, workspace, isAdmin: false } as const;
}

export async function GET(request: Request) {
  const auth = await admin();
  if ("error" in auth) return auth.error;
  const productId = new URL(request.url).searchParams.get("productId");
  if (!productId) return Response.json({ code: 400, message: "缺少 API ID" }, { status: 400, headers: noStoreHeaders });
  const product = await prisma.apiProduct.findUnique({ where: { id: productId }, select: { id: true, internalHandler: true, provider: { select: { ownerTenantId: true } } } });
  if (!product || !isAssetBackedHandler(product.internalHandler)) return Response.json({ code: 404, message: "可管理内容的 API 不存在" }, { status: 404, headers: noStoreHeaders });
  if (!auth.isAdmin && product.provider.ownerTenantId !== auth.workspace.tenantId) return Response.json({ code: 403, message: "无权管理其他服务商的 API 内容" }, { status: 403, headers: noStoreHeaders });
  if (product.internalHandler === "content.random-text") {
    const assets = await prisma.apiAsset.findMany({ where: { productId }, select: { id: true, kind: true, name: true, mimeType: true, size: true, createdAt: true, data: true }, orderBy: { createdAt: "desc" }, take: 1000 });
    return Response.json({ code: 200, data: assets.map((asset) => ({ ...asset, createdAt: asset.createdAt.toISOString(), data: undefined, preview: Buffer.from(asset.data).toString("utf8") })) }, { headers: noStoreHeaders });
  }
  const assets = await prisma.apiAsset.findMany({ where: { productId }, select: { id: true, kind: true, name: true, mimeType: true, size: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 1000 });
  return Response.json({ code: 200, data: assets.map((asset) => ({ ...asset, createdAt: asset.createdAt.toISOString(), preview: null })) }, { headers: noStoreHeaders });
}

export async function POST(request: Request) {
  const auth = await admin();
  if ("error" in auth) return auth.error;
  const form = await request.formData().catch(() => null);
  if (!form) return Response.json({ code: 400, message: "上传请求格式不正确" }, { status: 400, headers: noStoreHeaders });
  const productId = String(form.get("productId") ?? "");
  const content = String(form.get("content") ?? "");
  const entryFile = String(form.get("entryFile") ?? "index.php");
  const files = form.getAll("assets").filter((item): item is File => item instanceof File && item.size > 0);
  const product = await prisma.apiProduct.findUnique({ where: { id: productId }, select: { id: true, slug: true, internalHandler: true, executionConfig: true, provider: { select: { ownerTenantId: true } }, _count: { select: { assets: true } } } });
  if (!product || !isAssetBackedHandler(product.internalHandler)) return Response.json({ code: 404, message: "可管理内容的 API 不存在" }, { status: 404, headers: noStoreHeaders });
  if (!auth.isAdmin && product.provider.ownerTenantId !== auth.workspace.tenantId) return Response.json({ code: 403, message: "无权管理其他服务商的 API 内容" }, { status: 403, headers: noStoreHeaders });
  let assets;
  let normalizedEntry = entryFile;
  try {
    if (product.internalHandler === phpHandlerId) {
      const prepared = await preparePhpPackage(files[0], entryFile);
      assets = prepared.assets;
      normalizedEntry = prepared.entryFile;
    } else if (isContentHandler(product.internalHandler)) assets = await prepareApiAssets(product.internalHandler, { files, content });
    else throw new Error("ASSETS_REQUIRED");
  }
  catch (error) { return Response.json({ code: 400, message: assetErrorMessage(error) ?? "上传内容无法处理" }, { status: 400, headers: noStoreHeaders }); }
  const replaceAll = product.internalHandler === "content.static-json" || product.internalHandler === phpHandlerId;
  if (!replaceAll && product._count.assets + assets.length > 1000) return Response.json({ code: 409, message: "单个 API 最多保存 1000 项内容" }, { status: 409, headers: noStoreHeaders });
  const currentSize = await prisma.apiAsset.aggregate({ where: { productId }, _sum: { size: true } });
  if (!replaceAll && Number(currentSize._sum.size ?? 0) + assets.reduce((sum, item) => sum + item.size, 0) > MAX_TOTAL_ASSET_BYTES) return Response.json({ code: 409, message: "单个 API 的内容总大小不能超过 64 MB" }, { status: 409, headers: noStoreHeaders });
  await prisma.$transaction(async (transaction) => {
    if (replaceAll) await transaction.apiAsset.deleteMany({ where: { productId } });
    await transaction.apiAsset.createMany({ data: assets.map((asset) => ({ ...asset, productId })) });
    if (product.internalHandler === phpHandlerId) {
      const config = product.executionConfig && typeof product.executionConfig === "object" && !Array.isArray(product.executionConfig) ? product.executionConfig as Record<string, unknown> : {};
      await transaction.apiProduct.update({ where: { id: product.id }, data: { executionConfig: { ...config, entryFile: normalizedEntry } } });
    }
    await transaction.auditLog.create({ data: { tenantId: auth.workspace?.tenantId, actorId: auth.user.id, action: replaceAll ? "api.content.replace" : "api.content.add", resource: "api-product", resourceId: product.id, metadata: { count: assets.length, bytes: assets.reduce((sum, item) => sum + item.size, 0), ...(product.internalHandler === phpHandlerId ? { entryFile: normalizedEntry } : {}) }, ipAddress: requestIp(request) } });
  });
  revalidatePath("/", "layout");
  return Response.json({ code: 201, message: product.internalHandler === phpHandlerId ? "PHP 程序包已部署" : product.internalHandler === "content.static-json" ? "JSON 响应已更新" : `已添加 ${assets.length} 项内容` }, { status: 201, headers: noStoreHeaders });
}

export async function DELETE(request: Request) {
  const auth = await admin();
  if ("error" in auth) return auth.error;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ code: 400, message: "缺少内容 ID" }, { status: 400, headers: noStoreHeaders });
  const asset = await prisma.apiAsset.findUnique({ where: { id }, include: { product: { select: { id: true, slug: true, provider: { select: { ownerTenantId: true } } } } } });
  if (!asset) return Response.json({ code: 404, message: "内容不存在" }, { status: 404, headers: noStoreHeaders });
  if (!auth.isAdmin && asset.product.provider.ownerTenantId !== auth.workspace.tenantId) return Response.json({ code: 403, message: "无权管理其他服务商的 API 内容" }, { status: 403, headers: noStoreHeaders });
  if (asset.kind === "PHP_SOURCE") return Response.json({ code: 409, message: "PHP 程序包必须通过上传新 ZIP 整体替换" }, { status: 409, headers: noStoreHeaders });
  await prisma.$transaction([
    prisma.apiAsset.delete({ where: { id } }),
    prisma.auditLog.create({ data: { tenantId: auth.workspace?.tenantId, actorId: auth.user.id, action: "api.content.delete", resource: "api-product", resourceId: asset.product.id, metadata: { assetId: asset.id, name: asset.name }, ipAddress: requestIp(request) } }),
  ]);
  revalidatePath("/", "layout");
  return Response.json({ code: 200, message: "内容已删除" }, { headers: noStoreHeaders });
}
