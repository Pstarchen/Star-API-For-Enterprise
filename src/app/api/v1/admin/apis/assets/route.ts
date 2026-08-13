import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { generateResponseExample } from "@/lib/api-contracts";
import { getCurrentUser, getCurrentWorkspace } from "@/lib/server/auth";
import { assetErrorMessage, inferPreparedDatasetContract, MAX_TOTAL_ASSET_BYTES, prepareApiAssets, preparedContentResponseExample, preparePhpPackage } from "@/lib/server/api-assets";
import { lockApiProduct } from "@/lib/server/api-product-lock";
import { isAssetBackedHandler, isContentHandler, phpHandlerId } from "@/lib/internal-handlers";
import { prisma } from "@/lib/server/prisma";
import { noStoreHeaders, requestIp } from "@/lib/server/request";
import { removeStoredMedia } from "@/lib/server/media-storage";

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
  const product = await prisma.apiProduct.findUnique({ where: { id: productId }, select: { id: true, internalHandler: true, executionConfig: true, provider: { select: { ownerTenantId: true } } } });
  if (!product || !isAssetBackedHandler(product.internalHandler)) return Response.json({ code: 404, message: "可管理内容的 API 不存在" }, { status: 404, headers: noStoreHeaders });
  if (!auth.isAdmin && product.provider.ownerTenantId !== auth.workspace.tenantId) return Response.json({ code: 403, message: "无权管理其他服务商的 API 内容" }, { status: 403, headers: noStoreHeaders });
  if (!auth.isAdmin && product.internalHandler === phpHandlerId) return Response.json({ code: 403, message: "PHP 程序包仅平台管理员可以部署" }, { status: 403, headers: noStoreHeaders });
  if (["content.random-image", "content.random-video"].includes(product.internalHandler ?? "")) {
    const kind = product.internalHandler === "content.random-video" ? "VIDEO" : "IMAGE";
    const [assets, total, size] = await Promise.all([
      prisma.apiAsset.findMany({ where: { productId, kind }, select: { id: true, kind: true, name: true, mimeType: true, size: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 500 }),
      prisma.apiAsset.count({ where: { productId, kind } }),
      prisma.apiAsset.aggregate({ where: { productId, kind }, _sum: { size: true } }),
    ]);
    return Response.json({ code: 200, data: assets.map((asset) => ({ ...asset, size: Number(asset.size), createdAt: asset.createdAt.toISOString(), preview: null })), meta: { total, size: Number(size._sum.size ?? 0), displayed: assets.length } }, { headers: noStoreHeaders });
  }
  if (product.internalHandler === "content.random-text") {
    const assets = await prisma.apiAsset.findMany({ where: { productId }, select: { id: true, kind: true, name: true, mimeType: true, size: true, createdAt: true, data: true }, orderBy: { createdAt: "desc" }, take: 1000 });
    return Response.json({ code: 200, data: assets.map((asset) => ({ ...asset, size: Number(asset.size), createdAt: asset.createdAt.toISOString(), data: undefined, preview: Buffer.from(asset.data).toString("utf8") })) }, { headers: noStoreHeaders });
  }
  const assets = await prisma.apiAsset.findMany({ where: { productId }, select: { id: true, kind: true, name: true, mimeType: true, size: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 1000 });
  const executionConfig = product.executionConfig && typeof product.executionConfig === "object" && !Array.isArray(product.executionConfig) ? product.executionConfig as Record<string, unknown> : {};
  return Response.json({ code: 200, data: assets.map((asset) => ({ ...asset, size: Number(asset.size), createdAt: asset.createdAt.toISOString(), preview: null })), meta: { entryFile: typeof executionConfig.entryFile === "string" ? executionConfig.entryFile : "" } }, { headers: noStoreHeaders });
}

export async function POST(request: Request) {
  const auth = await admin();
  if ("error" in auth) return auth.error;
  const form = await request.formData().catch(() => null);
  if (!form) return Response.json({ code: 400, message: "上传请求格式不正确" }, { status: 400, headers: noStoreHeaders });
  const productId = String(form.get("productId") ?? "");
  const content = String(form.get("content") ?? "");
  const entryFile = String(form.get("entryFile") ?? "");
  const files = form.getAll("assets").filter((item): item is File => item instanceof File && item.size > 0);
  const product = await prisma.apiProduct.findUnique({ where: { id: productId }, select: { id: true, slug: true, internalHandler: true, executionConfig: true, provider: { select: { ownerTenantId: true } }, versions: { orderBy: { version: "desc" }, take: 1, select: { endpoints: { take: 1, select: { id: true, responseFormats: true, responseParameters: { orderBy: { sortOrder: "asc" }, select: { name: true, dataType: true, description: true } } } } } }, _count: { select: { assets: true } } } });
  if (!product || !isAssetBackedHandler(product.internalHandler)) return Response.json({ code: 404, message: "可管理内容的 API 不存在" }, { status: 404, headers: noStoreHeaders });
  if (!auth.isAdmin && product.provider.ownerTenantId !== auth.workspace.tenantId) return Response.json({ code: 403, message: "无权管理其他服务商的 API 内容" }, { status: 403, headers: noStoreHeaders });
  if (!auth.isAdmin && product.internalHandler === phpHandlerId) return Response.json({ code: 403, message: "PHP 程序包仅平台管理员可以部署" }, { status: 403, headers: noStoreHeaders });
  if (["content.random-image", "content.random-video"].includes(product.internalHandler ?? "")) return Response.json({ code: 409, message: "图片和视频请使用流式上传入口" }, { status: 409, headers: noStoreHeaders });
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
  const replaceAll = ["content.static-json", "content.dataset", phpHandlerId].includes(product.internalHandler ?? "");
  if (!replaceAll && product._count.assets + assets.length > 1000) return Response.json({ code: 409, message: "单个 API 最多保存 1000 项内容" }, { status: 409, headers: noStoreHeaders });
  const currentSize = await prisma.apiAsset.aggregate({ where: { productId }, _sum: { size: true } });
  if (!replaceAll && Number(currentSize._sum.size ?? 0) + assets.reduce((sum, item) => sum + item.size, 0) > MAX_TOTAL_ASSET_BYTES) return Response.json({ code: 409, message: "单个 API 的内容总大小不能超过 64 MB" }, { status: 409, headers: noStoreHeaders });
  const endpoint = product.versions[0]?.endpoints[0];
  const contentSample = endpoint && isContentHandler(product.internalHandler) ? preparedContentResponseExample(product.internalHandler, assets, product.executionConfig, endpoint.responseFormats) : undefined;
  const executionConfig = product.executionConfig && typeof product.executionConfig === "object" && !Array.isArray(product.executionConfig) ? product.executionConfig as Record<string, unknown> : {};
  const datasetConfig = executionConfig.dataset && typeof executionConfig.dataset === "object" && !Array.isArray(executionConfig.dataset) ? executionConfig.dataset as Record<string, unknown> : {};
  const itemsPath = typeof datasetConfig.itemsPath === "string" ? datasetConfig.itemsPath.trim() : "";
  if (product.internalHandler === "content.dataset" && itemsPath && contentSample === undefined) return Response.json({ code: 400, message: `新文件中不存在已配置的数据数组路径 ${itemsPath}，原内容已保留` }, { status: 400, headers: noStoreHeaders });
  const inferredContract = product.internalHandler === "content.dataset" && datasetConfig.contractMode === "AUTO" ? inferPreparedDatasetContract(assets, product.executionConfig) : null;
  const responseParameters = inferredContract?.responseParameters ?? endpoint?.responseParameters ?? [];
  const responseExample = endpoint && isContentHandler(product.internalHandler)
    ? generateResponseExample(responseParameters, endpoint.responseFormats, contentSample)
    : undefined;
  await prisma.$transaction(async (transaction) => {
    if (replaceAll) {
      if (!(await lockApiProduct(transaction, productId))) throw new Error("API_NOT_FOUND");
      await transaction.apiAsset.deleteMany({ where: { productId } });
    }
    await transaction.apiAsset.createMany({ data: assets.map((asset) => ({ ...asset, productId, size: BigInt(asset.size) })) });
    if (product.internalHandler === phpHandlerId) {
      const config = product.executionConfig && typeof product.executionConfig === "object" && !Array.isArray(product.executionConfig) ? product.executionConfig as Record<string, unknown> : {};
      await transaction.apiProduct.update({ where: { id: product.id }, data: { executionConfig: { ...config, entryFile: normalizedEntry } } });
    }
    if (endpoint && responseExample !== undefined) await transaction.endpoint.update({ where: { id: endpoint.id }, data: { responseExample: responseExample as Prisma.InputJsonValue } });
    if (endpoint && inferredContract) {
      await transaction.apiParameter.deleteMany({ where: { endpointId: endpoint.id } });
      if (inferredContract.parameters.length) await transaction.apiParameter.createMany({ data: inferredContract.parameters.map((parameter) => ({ endpointId: endpoint.id, location: parameter.location, name: parameter.name, upstreamName: parameter.upstreamName || null, required: parameter.required, dataType: parameter.dataType, defaultValue: parameter.defaultValue || null, description: parameter.description, validation: parameter.pattern ? { pattern: parameter.pattern } : {}, sensitive: parameter.sensitive })) });
      await transaction.apiResponseParameter.deleteMany({ where: { endpointId: endpoint.id } });
      if (inferredContract.responseParameters.length) await transaction.apiResponseParameter.createMany({ data: inferredContract.responseParameters.map((parameter, sortOrder) => ({ endpointId: endpoint.id, ...parameter, sortOrder })) });
    }
    await transaction.auditLog.create({ data: { tenantId: auth.workspace?.tenantId, actorId: auth.user.id, action: replaceAll ? "api.content.replace" : "api.content.add", resource: "api-product", resourceId: product.id, metadata: { count: assets.length, bytes: assets.reduce((sum, item) => sum + item.size, 0), ...(product.internalHandler === phpHandlerId ? { entryFile: normalizedEntry } : {}) }, ipAddress: requestIp(request) } });
  });
  revalidatePath("/", "layout");
  return Response.json({ code: 201, message: product.internalHandler === phpHandlerId ? `PHP 程序包已部署，入口为 ${normalizedEntry}` : product.internalHandler === "content.static-json" ? "JSON 响应已更新" : product.internalHandler === "content.dataset" ? `通用数据源已替换，共 ${assets.length} 个文件` : `已添加 ${assets.length} 项内容`, ...(product.internalHandler === phpHandlerId ? { data: { entryFile: normalizedEntry } } : {}) }, { status: 201, headers: noStoreHeaders });
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
  if (["IMAGE", "VIDEO"].includes(asset.kind)) await removeStoredMedia(asset.storageKey).catch(() => undefined);
  revalidatePath("/", "layout");
  return Response.json({ code: 200, message: "内容已删除" }, { headers: noStoreHeaders });
}
