import "server-only";

import { randomInt } from "node:crypto";
import { unzipSync } from "fflate";
import type { ContentHandlerId } from "@/lib/internal-handlers";
import { prisma } from "@/lib/server/prisma";
import { storedMediaResponse } from "@/lib/server/media-storage";

export const MAX_ASSET_FILES = 40;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_TOTAL_ASSET_BYTES = 64 * 1024 * 1024;
export const MAX_PHP_PACKAGE_BYTES = 16 * 1024 * 1024;
export const MAX_PHP_EXTRACTED_BYTES = 32 * 1024 * 1024;

export type PreparedAsset = { kind: "IMAGE" | "TEXT" | "JSON" | "PHP_SOURCE"; name: string; mimeType: string; data: Uint8Array<ArrayBuffer>; size: number };

function ownedBytes(value: string | ArrayBuffer): Uint8Array<ArrayBuffer> {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  const encoded = new TextEncoder().encode(value);
  const data = new Uint8Array(new ArrayBuffer(encoded.byteLength));
  data.set(encoded);
  return data;
}

function ownedArray(value: Uint8Array): Uint8Array<ArrayBuffer> {
  const data = new Uint8Array(new ArrayBuffer(value.byteLength));
  data.set(value);
  return data;
}

export function normalizePackagePath(value: string) {
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/{2,}/g, "/");
  if (!normalized || normalized.startsWith("/") || normalized.includes("\0") || normalized.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("INVALID_PACKAGE_PATH");
  return normalized;
}

export async function preparePhpPackage(file: File | undefined, entryFile: string) {
  if (!file || file.size <= 0) throw new Error("PHP_PACKAGE_REQUIRED");
  if (file.size > MAX_PHP_PACKAGE_BYTES) throw new Error("PHP_PACKAGE_TOO_LARGE");
  const entry = normalizePackagePath(entryFile || "index.php");
  if (!entry.toLowerCase().endsWith(".php")) throw new Error("INVALID_PHP_ENTRY");
  let unpacked: Record<string, Uint8Array>;
  try { unpacked = unzipSync(new Uint8Array(await file.arrayBuffer())); } catch { throw new Error("INVALID_ZIP"); }
  const files = Object.entries(unpacked).filter(([name]) => !name.endsWith("/"));
  if (!files.length || files.length > 200) throw new Error("INVALID_PACKAGE_FILE_COUNT");
  const prepared = files.map(([name, bytes]) => {
    const path = normalizePackagePath(name);
    if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error("PACKAGE_FILE_TOO_LARGE");
    return { kind: "PHP_SOURCE" as const, name: path, mimeType: "application/octet-stream", data: ownedArray(bytes), size: bytes.byteLength };
  });
  if (!prepared.some((item) => item.name === entry)) throw new Error("PHP_ENTRY_NOT_FOUND");
  if (prepared.reduce((sum, item) => sum + item.size, 0) > MAX_PHP_EXTRACTED_BYTES) throw new Error("PHP_EXTRACTED_TOO_LARGE");
  return { entryFile: entry, assets: prepared };
}

function detectedImageType(bytes: Uint8Array) {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP") return "image/webp";
  if (bytes.length >= 6 && ["GIF87a", "GIF89a"].includes(new TextDecoder().decode(bytes.slice(0, 6)))) return "image/gif";
  return null;
}

function textAssets(value: string, source: string) {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).map((item, index) => {
    const data = ownedBytes(item);
    return { kind: "TEXT" as const, name: `${source}-${index + 1}.txt`, mimeType: "text/plain; charset=utf-8", data, size: data.byteLength };
  });
}

export async function prepareApiAssets(handler: ContentHandlerId, input: { files: File[]; content?: string }) {
  if (input.files.length > MAX_ASSET_FILES) throw new Error("TOO_MANY_ASSETS");
  const prepared: PreparedAsset[] = [];

  if (handler === "content.random-image") {
    for (const file of input.files) {
      if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) throw new Error("INVALID_IMAGE_SIZE");
      const data = ownedBytes(await file.arrayBuffer());
      const mimeType = detectedImageType(data);
      if (!mimeType) throw new Error("UNSUPPORTED_IMAGE");
      prepared.push({ kind: "IMAGE", name: file.name.slice(0, 180) || "image", mimeType, data, size: data.byteLength });
    }
  }

  if (handler === "content.random-text") {
    if (input.content?.trim()) prepared.push(...textAssets(input.content, "text"));
    for (const file of input.files) {
      if (file.size <= 0 || file.size > MAX_TEXT_FILE_BYTES) throw new Error("INVALID_TEXT_SIZE");
      const value = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
      prepared.push(...textAssets(value, file.name.replace(/\.[^.]+$/, "").slice(0, 80) || "text"));
    }
  }

  if (handler === "content.static-json") {
    let source = input.content?.trim() ?? "";
    if (!source && input.files[0]) {
      if (input.files[0].size <= 0 || input.files[0].size > MAX_TEXT_FILE_BYTES) throw new Error("INVALID_JSON_SIZE");
      source = new TextDecoder("utf-8", { fatal: true }).decode(await input.files[0].arrayBuffer());
    }
    let normalized: string;
    try { normalized = JSON.stringify(JSON.parse(source)); } catch { throw new Error("INVALID_JSON"); }
    const data = ownedBytes(normalized);
    prepared.push({ kind: "JSON", name: input.files[0]?.name.slice(0, 180) || "response.json", mimeType: "application/json; charset=utf-8", data, size: data.byteLength });
  }

  const total = prepared.reduce((sum, item) => sum + item.size, 0);
  if (total > MAX_TOTAL_ASSET_BYTES) throw new Error("ASSETS_TOO_LARGE");
  if (!prepared.length) throw new Error("ASSETS_REQUIRED");
  return prepared;
}

export function assetErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return null;
  const messages: Record<string, string> = {
    TOO_MANY_ASSETS: `单次最多上传 ${MAX_ASSET_FILES} 个文件`,
    INVALID_IMAGE_SIZE: `每张图片必须小于 ${MAX_IMAGE_BYTES / 1024 / 1024} MB`,
    UNSUPPORTED_IMAGE: "仅支持真实的 PNG、JPEG、WebP 或 GIF 图片",
    INVALID_TEXT_SIZE: `每个文本文件必须小于 ${MAX_TEXT_FILE_BYTES / 1024 / 1024} MB`,
    INVALID_JSON_SIZE: `JSON 文件必须小于 ${MAX_TEXT_FILE_BYTES / 1024 / 1024} MB`,
    INVALID_JSON: "JSON 内容格式不正确",
    ASSETS_TOO_LARGE: `单次内容总大小不能超过 ${MAX_TOTAL_ASSET_BYTES / 1024 / 1024} MB`,
    ASSETS_REQUIRED: "请添加至少一项可返回的内容",
    PHP_PACKAGE_REQUIRED: "请选择包含 PHP 源码和附属文件的 ZIP 包",
    PHP_PACKAGE_TOO_LARGE: `PHP ZIP 包不能超过 ${MAX_PHP_PACKAGE_BYTES / 1024 / 1024} MB`,
    INVALID_PACKAGE_PATH: "ZIP 中包含不安全的文件路径",
    INVALID_PHP_ENTRY: "入口文件必须是 PHP 文件",
    INVALID_ZIP: "无法读取 ZIP 程序包",
    INVALID_PACKAGE_FILE_COUNT: "PHP 程序包必须包含 1 至 200 个文件",
    PACKAGE_FILE_TOO_LARGE: `程序包内单个文件不能超过 ${MAX_IMAGE_BYTES / 1024 / 1024} MB`,
    PHP_ENTRY_NOT_FOUND: "ZIP 中没有找到指定的 PHP 入口文件",
    PHP_EXTRACTED_TOO_LARGE: `PHP 程序包解压后不能超过 ${MAX_PHP_EXTRACTED_BYTES / 1024 / 1024} MB`,
  };
  return messages[error.message] ?? null;
}

export async function contentResponse(productId: string, handler: ContentHandlerId, request: Request) {
  if (handler === "content.random-video") {
    const count = await prisma.apiAsset.count({ where: { productId, kind: "VIDEO" } });
    if (!count) throw new Error("CONTENT_NOT_CONFIGURED");
    const asset = await prisma.apiAsset.findFirst({
      where: { productId, kind: "VIDEO" },
      orderBy: { createdAt: "asc" },
      skip: randomInt(count),
      select: { id: true, storageKey: true, name: true, mimeType: true, size: true },
    });
    if (!asset) throw new Error("CONTENT_NOT_CONFIGURED");
    return storedMediaResponse({ ...asset, kind: "VIDEO" }, request);
  }
  const kind = handler === "content.random-image" ? "IMAGE" : handler === "content.random-text" ? "TEXT" : "JSON";
  const count = await prisma.apiAsset.count({ where: { productId, kind } });
  if (!count) throw new Error("CONTENT_NOT_CONFIGURED");
  const asset = await prisma.apiAsset.findFirst({ where: { productId, kind }, orderBy: { createdAt: "asc" }, skip: handler === "content.static-json" ? 0 : randomInt(count) });
  if (!asset) throw new Error("CONTENT_NOT_CONFIGURED");
  if (kind === "IMAGE" && asset.storageKey) return storedMediaResponse(asset, request);
  const headers = new Headers({ "Content-Type": asset.mimeType, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Star-Asset-Id": asset.id });
  if (kind === "IMAGE") headers.set("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(asset.name)}`);
  return { response: new Response(Buffer.from(asset.data), { status: 200, headers }), responseBytes: asset.size };
}
