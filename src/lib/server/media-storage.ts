import "server-only";

import { createReadStream } from "node:fs";
import { mkdir, open, rename, stat, unlink } from "node:fs/promises";
import { basename, extname, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { detectImageSignature } from "@/lib/image-signature";

const DEFAULT_MAX_API_GB = 100;
const MAX_MEDIA_FILES = 10_000;

export type MediaKind = "IMAGE" | "VIDEO";
type StoredMedia = { storageKey: string; name: string; mimeType: string; size: bigint; kind: MediaKind };
type MediaAsset = { id: string; storageKey: string | null; name: string; mimeType: string; size: bigint; kind: string };

function positiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function mediaStorageLimits() {
  return {
    maxApiBytes: BigInt(Math.floor(positiveNumber(process.env.MEDIA_MAX_API_GB, DEFAULT_MAX_API_GB) * 1024 * 1024 * 1024)),
    maxFiles: MAX_MEDIA_FILES,
  };
}

function storageRoot() {
  return resolve(/* turbopackIgnore: true */ process.env.API_ASSET_STORAGE_PATH || ".data/api-assets");
}

function storedPath(storageKey: string) {
  const root = storageRoot();
  const target = resolve(root, storageKey);
  if (!target.startsWith(`${root}${sep}`)) throw new Error("INVALID_STORAGE_KEY");
  return target;
}

function safeFileName(value: string) {
  const decoded = (() => { try { return decodeURIComponent(value); } catch { return value; } })();
  return basename(decoded.replaceAll("\\", "/")).replace(/[\u0000-\u001f<>:"|?*]/g, "_").trim().slice(0, 180) || "media";
}

async function fileHeader(path: string) {
  const handle = await open(path, "r");
  try {
    const buffer = Buffer.alloc(32);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

async function detectedMedia(path: string, extension: string, kind: MediaKind) {
  const bytes = await fileHeader(path);
  const ascii = (start: number, end: number) => bytes.subarray(start, end).toString("ascii");
  if (kind === "IMAGE") {
    const signature = detectImageSignature(bytes);
    if (!signature) throw new Error("UNSUPPORTED_IMAGE");
    return signature;
  }
  if (bytes.length >= 12 && ascii(4, 8) === "ftyp" && [".mp4", ".m4v", ".mov"].includes(extension)) return extension === ".mov" ? "video/quicktime" : "video/mp4";
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3 && [".webm", ".mkv"].includes(extension)) return extension === ".mkv" ? "video/x-matroska" : "video/webm";
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "AVI " && extension === ".avi") return "video/x-msvideo";
  throw new Error("UNSUPPORTED_VIDEO");
}

export async function storeMediaRequest(input: { productId: string; encodedName: string; body: ReadableStream<Uint8Array>; kind: MediaKind; maximumBytes: bigint }) {
  const name = safeFileName(input.encodedName);
  const extension = extname(name).toLowerCase();
  const allowed = input.kind === "IMAGE" ? [".png", ".jpg", ".jpeg", ".webp", ".gif"] : [".mp4", ".m4v", ".webm", ".mov", ".mkv", ".avi"];
  if (!allowed.includes(extension)) throw new Error(input.kind === "IMAGE" ? "UNSUPPORTED_IMAGE" : "UNSUPPORTED_VIDEO");

  const root = storageRoot();
  const productDirectory = resolve(root, input.productId);
  const temporaryDirectory = resolve(root, ".tmp");
  await Promise.all([mkdir(productDirectory, { recursive: true }), mkdir(temporaryDirectory, { recursive: true })]);
  const id = crypto.randomUUID();
  const temporaryPath = resolve(temporaryDirectory, `${id}.upload`);
  const file = await open(temporaryPath, "wx", 0o600);
  let size = BigInt(0);
  try {
    const reader = input.body.getReader();
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += BigInt(chunk.value.byteLength);
      if (size > input.maximumBytes) {
        await reader.cancel();
        throw new Error("MEDIA_API_LIMIT");
      }
      await file.write(chunk.value);
    }
  } catch (error) {
    await file.close().catch(() => undefined);
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
  await file.close();
  if (!size) {
    await unlink(temporaryPath).catch(() => undefined);
    throw new Error("EMPTY_MEDIA");
  }
  try {
    const detected = await detectedMedia(temporaryPath, extension, input.kind);
    const mimeType = typeof detected === "string" ? detected : detected.mimeType;
    const storageExtension = typeof detected === "string" ? extension : detected.extension;
    const storageKey = `${input.productId}/${id}${storageExtension}`;
    const finalPath = storedPath(storageKey);
    await rename(temporaryPath, finalPath);
    return { storageKey, name, mimeType, size, kind: input.kind } satisfies StoredMedia;
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

export async function removeStoredMedia(storageKey: string | null | undefined) {
  if (!storageKey) return;
  await unlink(storedPath(storageKey)).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
}

function requestedRange(value: string | null, size: number) {
  if (!value) return { start: 0, end: size - 1, partial: false };
  const match = value.match(/^bytes=(\d*)-(\d*)$/);
  if (!match || (!match[1] && !match[2])) return null;
  let start = match[1] ? Number(match[1]) : NaN;
  let end = match[2] ? Number(match[2]) : NaN;
  if (!match[1]) {
    const suffix = end;
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    start = Math.max(size - suffix, 0);
    end = size - 1;
  } else {
    if (!Number.isSafeInteger(start) || start < 0 || start >= size) return null;
    if (!match[2]) end = size - 1;
    if (!Number.isSafeInteger(end) || end < start) return null;
    end = Math.min(end, size - 1);
  }
  return { start, end, partial: true };
}

export async function storedMediaResponse(asset: MediaAsset, request: Request) {
  if (!asset.storageKey) throw new Error("MEDIA_FILE_MISSING");
  const path = storedPath(asset.storageKey);
  const file = await stat(/* turbopackIgnore: true */ path);
  if (!file.isFile() || file.size <= 0) throw new Error("MEDIA_FILE_MISSING");
  const isVideo = asset.kind === "VIDEO";
  const range = isVideo ? requestedRange(request.headers.get("range"), file.size) : { start: 0, end: file.size - 1, partial: false };
  const headers = new Headers({
    "Content-Type": asset.mimeType,
    "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(asset.name)}`,
    "X-Content-Type-Options": "nosniff",
    "X-Star-Asset-Id": asset.id,
  });
  if (isVideo) headers.set("Accept-Ranges", "bytes");
  if (!range) {
    headers.set("Content-Range", `bytes */${file.size}`);
    return { response: new Response(null, { status: 416, headers }), responseBytes: BigInt(0) };
  }
  const length = range.end - range.start + 1;
  headers.set("Content-Length", String(length));
  if (range.partial) headers.set("Content-Range", `bytes ${range.start}-${range.end}/${file.size}`);
  const stream = Readable.toWeb(createReadStream(/* turbopackIgnore: true */ path, { start: range.start, end: range.end })) as ReadableStream<Uint8Array>;
  return { response: new Response(request.method === "HEAD" ? null : stream, { status: range.partial ? 206 : 200, headers }), responseBytes: BigInt(length) };
}
