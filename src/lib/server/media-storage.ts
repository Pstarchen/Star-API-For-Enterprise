import "server-only";

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, rename, stat, unlink } from "node:fs/promises";
import { basename, extname, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { Unzip, UnzipInflate } from "fflate";
import { detectImageSignature } from "@/lib/image-signature";

const DEFAULT_MAX_API_GB = 100;
const DEFAULT_MAX_ARCHIVE_GB = 2;
const DEFAULT_MAX_ARCHIVE_EXPANDED_GB = 20;
const MAX_MEDIA_FILES = 10_000;

export type MediaKind = "IMAGE" | "VIDEO";
export type StoredMedia = { storageKey: string; name: string; mimeType: string; size: bigint; kind: MediaKind; checksum: string };
export type MediaArchiveStorageResult = { name: string; stored?: StoredMedia; error?: string };
type MediaAsset = { id: string; storageKey: string | null; name: string; mimeType: string; size: bigint; kind: string };

function positiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function mediaStorageLimits() {
  return {
    maxApiBytes: BigInt(Math.floor(positiveNumber(process.env.MEDIA_MAX_API_GB, DEFAULT_MAX_API_GB) * 1024 * 1024 * 1024)),
    maxArchiveBytes: BigInt(Math.floor(positiveNumber(process.env.MEDIA_MAX_ARCHIVE_GB, DEFAULT_MAX_ARCHIVE_GB) * 1024 * 1024 * 1024)),
    maxArchiveExpandedBytes: BigInt(Math.floor(positiveNumber(process.env.MEDIA_MAX_ARCHIVE_EXPANDED_GB, DEFAULT_MAX_ARCHIVE_EXPANDED_GB) * 1024 * 1024 * 1024)),
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
    const buffer = Buffer.alloc(4096);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

const imageMimeByExtension: Record<string, string> = {
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".gif": "image/gif",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".ico": "image/x-icon",
  ".jfif": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".webp": "image/webp",
};

const videoMimeByExtension: Record<string, string> = {
  ".3g2": "video/3gpp2",
  ".3gp": "video/3gpp",
  ".avi": "video/x-msvideo",
  ".m4v": "video/mp4",
  ".mkv": "video/x-matroska",
  ".mov": "video/quicktime",
  ".mp4": "video/mp4",
  ".mpeg": "video/mpeg",
  ".mpg": "video/mpeg",
  ".ogv": "video/ogg",
  ".ts": "video/mp2t",
  ".webm": "video/webm",
};

function declaredMediaMimeType(value: string | undefined, kind: MediaKind) {
  const declared = value?.trim().toLowerCase().split(";", 1)[0] ?? "";
  const allowed = new Set(Object.values(kind === "IMAGE" ? imageMimeByExtension : videoMimeByExtension));
  return allowed.has(declared) ? declared : null;
}

function safeStorageExtension(extension: string) {
  return /^\.[a-z0-9]{1,12}$/.test(extension) ? extension : ".bin";
}

async function mediaMetadata(path: string, extension: string, kind: MediaKind, declaredMimeType?: string) {
  const bytes = await fileHeader(path);
  const ascii = (start: number, end: number) => bytes.subarray(start, end).toString("ascii");
  if (kind === "IMAGE") {
    const signature = detectImageSignature(bytes);
    if (signature) return signature;
    return { mimeType: imageMimeByExtension[extension] ?? declaredMediaMimeType(declaredMimeType, kind) ?? "application/octet-stream", extension: safeStorageExtension(extension) };
  }
  if (bytes.length >= 12 && ascii(4, 8) === "ftyp") {
    const quickTime = ascii(8, 12) === "qt  ";
    return { mimeType: quickTime ? "video/quicktime" : "video/mp4", extension: quickTime ? ".mov" : extension === ".m4v" ? ".m4v" : ".mp4" };
  }
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return extension === ".webm" ? { mimeType: "video/webm", extension: ".webm" } : { mimeType: "video/x-matroska", extension: ".mkv" };
  }
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "AVI ") return { mimeType: "video/x-msvideo", extension: ".avi" };
  return { mimeType: videoMimeByExtension[extension] ?? declaredMediaMimeType(declaredMimeType, kind) ?? "application/octet-stream", extension: safeStorageExtension(extension) };
}

export async function storeMediaRequest(input: { productId: string; encodedName: string; body: ReadableStream<Uint8Array>; kind: MediaKind; maximumBytes: bigint; declaredMimeType?: string }) {
  const name = safeFileName(input.encodedName);
  const extension = extname(name).toLowerCase();

  const root = storageRoot();
  const productDirectory = resolve(root, input.productId);
  const temporaryDirectory = resolve(root, ".tmp");
  await Promise.all([mkdir(productDirectory, { recursive: true }), mkdir(temporaryDirectory, { recursive: true })]);
  const id = crypto.randomUUID();
  const temporaryPath = resolve(temporaryDirectory, `${id}.upload`);
  const file = await open(temporaryPath, "wx", 0o600);
  let size = BigInt(0);
  const hash = createHash("sha256");
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
      hash.update(chunk.value);
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
    const detected = await mediaMetadata(temporaryPath, extension, input.kind, input.declaredMimeType);
    const mimeType = detected.mimeType;
    const storageExtension = detected.extension;
    const storageKey = `${input.productId}/${id}${storageExtension}`;
    const finalPath = storedPath(storageKey);
    await rename(temporaryPath, finalPath);
    return { storageKey, name, mimeType, size, kind: input.kind, checksum: hash.digest("hex") } satisfies StoredMedia;
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

function archiveEntryName(value: string) {
  const normalized = value.replaceAll("\\", "/");
  const segments = normalized.split("/");
  if (!normalized || normalized.includes("\0") || normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized) || segments.includes("..")) throw new Error("INVALID_MEDIA_ARCHIVE_PATH");
  return safeFileName(encodeURIComponent(segments.at(-1) ?? "media"));
}

function errorCode(error: unknown) {
  return error instanceof Error && error.message ? error.message : "INVALID_MEDIA_ARCHIVE_ENTRY";
}

export async function storeMediaArchiveRequest(input: {
  productId: string;
  body: ReadableStream<Uint8Array>;
  kind: MediaKind;
  maximumArchiveBytes: bigint;
  maximumExpandedBytes: bigint;
  maximumFiles: number;
}) {
  const reader = input.body.getReader();
  const results: MediaArchiveStorageResult[] = [];
  const tasks: Promise<void>[] = [];
  const writers = new Set<WritableStreamDefaultWriter<Uint8Array>>();
  let pendingWrites: Promise<unknown>[] = [];
  let archiveBytes = BigInt(0);
  let expandedBytes = BigInt(0);
  let declaredExpandedBytes = BigInt(0);
  let fileCount = 0;
  let archiveError: Error | null = null;

  const unzip = new Unzip((entry) => {
    if (entry.name.endsWith("/")) return;
    fileCount += 1;
    if (fileCount > input.maximumFiles) {
      archiveError = new Error("MEDIA_ARCHIVE_FILE_LIMIT");
      return;
    }
    let name: string;
    try {
      name = archiveEntryName(entry.name);
    } catch (error) {
      results.push({ name: entry.name || "未知条目", error: errorCode(error) });
      return;
    }
    if (![0, 8].includes(entry.compression)) {
      results.push({ name, error: "UNSUPPORTED_MEDIA_ARCHIVE_COMPRESSION" });
      return;
    }
    if (entry.originalSize !== undefined) {
      const declaredSize = BigInt(entry.originalSize);
      if (declaredSize > input.maximumExpandedBytes || declaredExpandedBytes + declaredSize > input.maximumExpandedBytes) {
        results.push({ name, error: "MEDIA_ARCHIVE_EXPANDED_LIMIT" });
        return;
      }
      declaredExpandedBytes += declaredSize;
    }

    const transform = new TransformStream<Uint8Array, Uint8Array>();
    const writer = transform.writable.getWriter();
    writers.add(writer);
    const task = storeMediaRequest({
      productId: input.productId,
      encodedName: encodeURIComponent(name),
      body: transform.readable,
      kind: input.kind,
      maximumBytes: input.maximumExpandedBytes,
    }).then((stored) => {
      results.push({ name, stored });
    }).catch((error) => {
      results.push({ name, error: errorCode(error) });
    }).finally(() => {
      writers.delete(writer);
    });
    tasks.push(task);
    entry.ondata = (error, chunk, final) => {
      if (error) {
        pendingWrites.push(writer.abort(error).catch(() => undefined));
        return;
      }
      expandedBytes += BigInt(chunk.byteLength);
      if (expandedBytes > input.maximumExpandedBytes) {
        archiveError = new Error("MEDIA_ARCHIVE_EXPANDED_LIMIT");
        pendingWrites.push(writer.abort(archiveError).catch(() => undefined));
        return;
      }
      if (chunk.byteLength) pendingWrites.push(writer.write(Uint8Array.from(chunk)));
      if (final) pendingWrites.push(writer.close());
    };
    try {
      entry.start();
    } catch (error) {
      pendingWrites.push(writer.abort(error).catch(() => undefined));
    }
  });
  unzip.register(UnzipInflate);

  try {
    while (true) {
      const { value, done } = await reader.read();
      const chunk = value ?? new Uint8Array();
      archiveBytes += BigInt(chunk.byteLength);
      if (archiveBytes > input.maximumArchiveBytes) throw new Error("MEDIA_ARCHIVE_SIZE_LIMIT");
      pendingWrites = [];
      unzip.push(chunk, done);
      await Promise.allSettled(pendingWrites);
      if (archiveError) throw archiveError;
      if (done) break;
    }
    await Promise.allSettled(tasks);
    if (!fileCount) throw new Error("EMPTY_MEDIA_ARCHIVE");
    return results;
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    await Promise.allSettled([...writers].map((writer) => writer.abort(error)));
    await Promise.allSettled(tasks);
    await Promise.allSettled(results.flatMap((result) => result.stored ? [removeStoredMedia(result.stored.storageKey)] : []));
    if (error instanceof Error && ["MEDIA_ARCHIVE_FILE_LIMIT", "MEDIA_ARCHIVE_EXPANDED_LIMIT", "MEDIA_ARCHIVE_SIZE_LIMIT", "EMPTY_MEDIA_ARCHIVE"].includes(error.message)) throw error;
    throw new Error("INVALID_MEDIA_ARCHIVE");
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
