import "server-only";

import { randomInt } from "node:crypto";
import { parse as parseDelimited } from "csv-parse/sync";
import { unzipSync } from "fflate";
import { parseAllDocuments } from "yaml";
import type { ApiDataType, ApiRequestParameter, ApiResponseParameter } from "@/lib/api-contracts";
import type { ContentHandlerId } from "@/lib/internal-handlers";
import { normalizePackagePath, resolvePhpEntryFile } from "@/lib/php-package";
import { detectImageSignature } from "@/lib/image-signature";
import { prisma } from "@/lib/server/prisma";
import { storedMediaResponse } from "@/lib/server/media-storage";

export const MAX_ASSET_FILES = 40;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_DATASET_FILES = 200;
export const MAX_DATASET_FILE_BYTES = 16 * 1024 * 1024;
export const MAX_DATASET_ARCHIVE_BYTES = 16 * 1024 * 1024;
export const MAX_TOTAL_ASSET_BYTES = 64 * 1024 * 1024;
export const MAX_PHP_PACKAGE_BYTES = 16 * 1024 * 1024;
export const MAX_PHP_EXTRACTED_BYTES = 32 * 1024 * 1024;

export type PreparedAsset = { kind: "IMAGE" | "TEXT" | "JSON" | "DATASET" | "PHP_SOURCE"; name: string; groupKey: string; mimeType: string; data: Uint8Array<ArrayBuffer>; size: number };

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

export async function preparePhpPackage(file: File | undefined, entryFile: string) {
  if (!file || file.size <= 0) throw new Error("PHP_PACKAGE_REQUIRED");
  if (file.size > MAX_PHP_PACKAGE_BYTES) throw new Error("PHP_PACKAGE_TOO_LARGE");
  if (file.name.toLowerCase().endsWith(".php")) {
    const path = normalizePackagePath(file.name);
    const data = ownedBytes(await file.arrayBuffer());
    if (data.byteLength > MAX_IMAGE_BYTES) throw new Error("PACKAGE_FILE_TOO_LARGE");
    const asset = { kind: "PHP_SOURCE" as const, name: path, groupKey: "", mimeType: "application/x-httpd-php", data, size: data.byteLength };
    return { entryFile: resolvePhpEntryFile([asset.name], entryFile), assets: [asset] };
  }
  let unpacked: Record<string, Uint8Array>;
  let expandedFiles = 0;
  let expandedBytes = 0;
  try {
    unpacked = unzipSync(new Uint8Array(await file.arrayBuffer()), {
      filter(entry) {
        if (entry.name.endsWith("/")) return false;
        normalizePackagePath(entry.name);
        expandedFiles += 1;
        expandedBytes += entry.originalSize;
        if (expandedFiles > 200) throw new Error("INVALID_PACKAGE_FILE_COUNT");
        if (entry.originalSize > MAX_IMAGE_BYTES) throw new Error("PACKAGE_FILE_TOO_LARGE");
        if (expandedBytes > MAX_PHP_EXTRACTED_BYTES) throw new Error("PHP_EXTRACTED_TOO_LARGE");
        return true;
      },
    });
  } catch (error) {
    if (error instanceof Error && ["INVALID_PACKAGE_PATH", "INVALID_PACKAGE_FILE_COUNT", "PACKAGE_FILE_TOO_LARGE", "PHP_EXTRACTED_TOO_LARGE"].includes(error.message)) throw error;
    throw new Error("INVALID_ZIP");
  }
  const files = Object.entries(unpacked).filter(([name]) => !name.endsWith("/"));
  if (!files.length || files.length > 200) throw new Error("INVALID_PACKAGE_FILE_COUNT");
  const normalizedPaths = new Set<string>();
  const prepared = files.map(([name, bytes]) => {
    const path = normalizePackagePath(name);
    const comparablePath = path.toLowerCase();
    if (normalizedPaths.has(comparablePath)) throw new Error("DUPLICATE_PACKAGE_PATH");
    normalizedPaths.add(comparablePath);
    if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error("PACKAGE_FILE_TOO_LARGE");
    return { kind: "PHP_SOURCE" as const, name: path, groupKey: "", mimeType: "application/octet-stream", data: ownedArray(bytes), size: bytes.byteLength };
  });
  const entry = resolvePhpEntryFile(prepared.map((item) => item.name), entryFile);
  if (prepared.reduce((sum, item) => sum + item.size, 0) > MAX_PHP_EXTRACTED_BYTES) throw new Error("PHP_EXTRACTED_TOO_LARGE");
  return { entryFile: entry, assets: prepared };
}

function textAssets(value: string, source: string) {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).map((item, index) => {
    const data = ownedBytes(item);
    return { kind: "TEXT" as const, name: `${source}-${index + 1}.txt`, groupKey: "", mimeType: "text/plain; charset=utf-8", data, size: data.byteLength };
  });
}

function datasetGroupKey(fileName: string) {
  const path = fileName.replaceAll("\\", "/").replace(/\.[^./]+$/, "");
  const normalized = path.split("/").map((segment) => segment.trim().normalize("NFKC").replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "")).filter(Boolean).join("--").slice(0, 80);
  if (!normalized) throw new Error("INVALID_DATASET_GROUP");
  return normalized;
}

type DatasetFileFormat = "JSON" | "JSONL" | "CSV" | "TSV" | "YAML" | "TXT";

function declaredDatasetFileFormat(file: File): DatasetFileFormat | null {
  const extension = file.name.toLowerCase().match(/\.([^.]+)$/)?.[1] ?? "";
  if (["jsonl", "ndjson"].includes(extension) || file.type.includes("ndjson")) return "JSONL";
  if (extension === "json" || file.type.includes("application/json")) return "JSON";
  if (extension === "csv" || file.type.includes("text/csv")) return "CSV";
  if (extension === "tsv" || file.type.includes("tab-separated-values")) return "TSV";
  if (["yaml", "yml"].includes(extension) || file.type.includes("yaml")) return "YAML";
  if (extension === "txt" || file.type.startsWith("text/plain") || file.name === "default.txt") return "TXT";
  return null;
}

function isDatasetArchive(file: File) {
  return file.name.toLowerCase().endsWith(".zip") || ["application/zip", "application/x-zip-compressed"].includes(file.type.toLowerCase());
}

function parseJsonLines(source: string) {
  const values = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line) as unknown; }
    catch { throw new Error(`INVALID_DATASET_JSONL:${index + 1}`); }
  });
  if (!values.length) throw new Error("EMPTY_DATASET_FILE");
  return values;
}

function parseTabularData(source: string, delimiter: "," | "\t") {
  try {
    const records = parseDelimited(source, {
      bom: true,
      columns(headers: string[]) {
        const normalized = headers.map((header) => header.trim());
        if (normalized.some((header) => !header) || new Set(normalized).size !== normalized.length) throw new Error("INVALID_DATASET_HEADERS");
        return normalized;
      },
      delimiter,
      skip_empty_lines: true,
      relax_column_count: false,
    }) as Record<string, string>[];
    if (!records.length) throw new Error("EMPTY_DATASET_FILE");
    return records;
  } catch (error) {
    if (error instanceof Error && ["INVALID_DATASET_HEADERS", "EMPTY_DATASET_FILE"].includes(error.message)) throw error;
    throw new Error(delimiter === "," ? "INVALID_DATASET_CSV" : "INVALID_DATASET_TSV");
  }
}

function parseYamlDocuments(source: string) {
  let documents;
  try { documents = parseAllDocuments(source, { schema: "core" }); }
  catch { throw new Error("INVALID_DATASET_YAML"); }
  if (!documents.length || documents.some((document) => document.errors.length)) throw new Error("INVALID_DATASET_YAML");
  try {
    const values = documents.map((document) => document.toJS({ maxAliasCount: 100 }));
    if (!values.length || values.every((value) => value === null || value === undefined)) throw new Error("EMPTY_DATASET_FILE");
    return values.length === 1 ? values[0] : values;
  } catch (error) {
    if (error instanceof Error && error.message === "EMPTY_DATASET_FILE") throw error;
    throw new Error("INVALID_DATASET_YAML");
  }
}

function sniffDatasetFileFormat(source: string): DatasetFileFormat {
  const trimmed = source.trim();
  try {
    JSON.parse(trimmed);
    return "JSON";
  } catch {}

  const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length > 1) {
    try {
      parseJsonLines(trimmed);
      return "JSONL";
    } catch {}
    for (const [delimiter, format] of [["\t", "TSV"], [",", "CSV"]] as const) {
      if (!lines[0].includes(delimiter)) continue;
      try {
        const records = parseTabularData(trimmed, delimiter);
        if (Object.keys(records[0] ?? {}).length > 1) return format;
      } catch {}
    }
  }

  if (/^(?:---\s*$|\s*-\s+|\s*[\w"'][^\r\n:]{0,100}:\s*)/m.test(trimmed)) {
    try {
      const value = parseYamlDocuments(trimmed);
      if (value && typeof value === "object") return "YAML";
    } catch {}
  }
  return "TXT";
}

function datasetFileFormat(file: File, source: string): DatasetFileFormat {
  return declaredDatasetFileFormat(file) ?? sniffDatasetFileFormat(source);
}

function assertDatasetTextContent(source: string) {
  let controls = 0;
  for (const character of source) {
    const code = character.codePointAt(0) ?? 0;
    if (code === 0) throw new Error("INVALID_DATASET_CONTENT");
    if ((code < 0x20 && ![0x09, 0x0a, 0x0d].includes(code)) || code === 0x7f) controls += 1;
  }
  if (controls > Math.max(2, Math.floor(source.length * 0.005))) throw new Error("INVALID_DATASET_CONTENT");
}

function normalizeDatasetSource(source: string, format: DatasetFileFormat) {
  if (format === "TXT") {
    if (!source.split(/\r?\n/).some((line) => line.trim())) throw new Error("EMPTY_DATASET_FILE");
    return { content: source, mimeType: "text/plain; charset=utf-8" };
  }
  let value: unknown;
  if (format === "JSON") {
    try { value = JSON.parse(source); } catch { throw new Error("INVALID_DATASET_JSON"); }
  } else if (format === "JSONL") value = parseJsonLines(source);
  else if (format === "CSV") value = parseTabularData(source, ",");
  else if (format === "TSV") value = parseTabularData(source, "\t");
  else value = parseYamlDocuments(source);
  const content = JSON.stringify(value);
  if (!datasetItems({ mimeType: "application/json", data: ownedBytes(content) }, "").length) throw new Error("EMPTY_DATASET_FILE");
  return { content, mimeType: "application/json; charset=utf-8" };
}

function ignoredDatasetArchivePath(path: string) {
  const segments = path.split("/");
  return segments.includes("__MACOSX") || [".DS_Store", "Thumbs.db"].includes(segments.at(-1) ?? "");
}

async function expandedDatasetFiles(files: File[]) {
  const sources: File[] = [];
  let expandedBytes = 0;
  let expandedFiles = 0;
  for (const file of files) {
    if (!isDatasetArchive(file)) {
      expandedFiles += 1;
      expandedBytes += file.size;
      if (expandedFiles > MAX_DATASET_FILES) throw new Error("TOO_MANY_DATASET_FILES");
      if (expandedBytes > MAX_TOTAL_ASSET_BYTES) throw new Error("ASSETS_TOO_LARGE");
      sources.push(file);
      continue;
    }
    if (file.size <= 0 || file.size > MAX_DATASET_ARCHIVE_BYTES) throw new Error("INVALID_DATASET_ARCHIVE_SIZE");
    let unpacked: Record<string, Uint8Array>;
    try {
      unpacked = unzipSync(new Uint8Array(await file.arrayBuffer()), {
        filter(entry) {
          if (entry.name.endsWith("/")) return false;
          const path = normalizePackagePath(entry.name);
          if (ignoredDatasetArchivePath(path)) return false;
          expandedFiles += 1;
          expandedBytes += entry.originalSize;
          if (expandedFiles > MAX_DATASET_FILES) throw new Error("TOO_MANY_DATASET_FILES");
          if (entry.originalSize <= 0 || entry.originalSize > MAX_DATASET_FILE_BYTES) throw new Error("INVALID_DATASET_SIZE");
          if (expandedBytes > MAX_TOTAL_ASSET_BYTES) throw new Error("ASSETS_TOO_LARGE");
          return true;
        },
      });
    } catch (error) {
      if (error instanceof Error && ["TOO_MANY_DATASET_FILES", "INVALID_DATASET_SIZE", "ASSETS_TOO_LARGE", "INVALID_PACKAGE_PATH"].includes(error.message)) throw error;
      throw new Error("INVALID_DATASET_ARCHIVE");
    }
    for (const [name, bytes] of Object.entries(unpacked)) {
      if (name.endsWith("/")) continue;
      const path = normalizePackagePath(name);
      if (ignoredDatasetArchivePath(path)) continue;
      sources.push(new File([ownedArray(bytes)], path, { type: "application/octet-stream" }));
    }
  }
  if (sources.length > MAX_DATASET_FILES) throw new Error("TOO_MANY_DATASET_FILES");
  return sources;
}

async function prepareDatasetFiles(files: File[], content?: string) {
  const assets: PreparedAsset[] = [];
  const sources = await expandedDatasetFiles(files);
  if (content?.trim()) sources.unshift(new File([content], "default.txt", { type: "text/plain" }));
  if (sources.length > MAX_DATASET_FILES) throw new Error("TOO_MANY_DATASET_FILES");
  for (const file of sources) {
    if (file.size <= 0 || file.size > MAX_DATASET_FILE_BYTES) throw new Error("INVALID_DATASET_SIZE");
    const groupKey = datasetGroupKey(file.name);
    let decoded: string;
    try { decoded = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()).replace(/^\uFEFF/, ""); }
    catch { throw new Error("INVALID_DATASET_ENCODING"); }
    assertDatasetTextContent(decoded);
    const normalized = normalizeDatasetSource(decoded, datasetFileFormat(file, decoded));
    const data = ownedBytes(normalized.content);
    if (data.byteLength > MAX_DATASET_FILE_BYTES) throw new Error("INVALID_DATASET_SIZE");
    assets.push({ kind: "DATASET", name: file.name.slice(0, 180), groupKey, mimeType: normalized.mimeType, data, size: data.byteLength });
  }
  return assets;
}

export async function prepareApiAssets(handler: ContentHandlerId, input: { files: File[]; content?: string }) {
  if (input.files.length > (handler === "content.dataset" ? MAX_DATASET_FILES : MAX_ASSET_FILES)) throw new Error(handler === "content.dataset" ? "TOO_MANY_DATASET_FILES" : "TOO_MANY_ASSETS");
  const prepared: PreparedAsset[] = [];

  if (handler === "content.random-image") {
    for (const file of input.files) {
      if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) throw new Error("INVALID_IMAGE_SIZE");
      const data = ownedBytes(await file.arrayBuffer());
      const mimeType = detectImageSignature(data)?.mimeType;
      if (!mimeType) throw new Error("UNSUPPORTED_IMAGE");
      prepared.push({ kind: "IMAGE", name: file.name.slice(0, 180) || "image", groupKey: "", mimeType, data, size: data.byteLength });
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
    prepared.push({ kind: "JSON", name: input.files[0]?.name.slice(0, 180) || "response.json", groupKey: "", mimeType: "application/json; charset=utf-8", data, size: data.byteLength });
  }

  if (handler === "content.dataset") prepared.push(...await prepareDatasetFiles(input.files, input.content));

  const total = prepared.reduce((sum, item) => sum + item.size, 0);
  if (total > MAX_TOTAL_ASSET_BYTES) throw new Error("ASSETS_TOO_LARGE");
  if (!prepared.length) throw new Error("ASSETS_REQUIRED");
  return prepared;
}

export function assetErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return null;
  const errorCode = error.message.split(":", 1)[0];
  const messages: Record<string, string> = {
    TOO_MANY_ASSETS: `单次最多上传 ${MAX_ASSET_FILES} 个文件`,
    INVALID_IMAGE_SIZE: `每张图片必须小于 ${MAX_IMAGE_BYTES / 1024 / 1024} MB`,
    UNSUPPORTED_IMAGE: "仅支持真实的 PNG、JPEG、WebP 或 GIF 图片",
    INVALID_TEXT_SIZE: `每个文本文件必须小于 ${MAX_TEXT_FILE_BYTES / 1024 / 1024} MB`,
    INVALID_JSON_SIZE: `JSON 文件必须小于 ${MAX_TEXT_FILE_BYTES / 1024 / 1024} MB`,
    INVALID_JSON: "JSON 内容格式不正确",
    TOO_MANY_DATASET_FILES: `单次最多导入 ${MAX_DATASET_FILES} 个数据文件`,
    INVALID_DATASET_SIZE: `每个数据文件必须小于 ${MAX_DATASET_FILE_BYTES / 1024 / 1024} MB`,
    INVALID_DATASET_ARCHIVE_SIZE: `ZIP 数据包必须小于 ${MAX_DATASET_ARCHIVE_BYTES / 1024 / 1024} MB`,
    INVALID_DATASET_ARCHIVE: "ZIP 数据包损坏、加密或使用了不支持的压缩格式",
    INVALID_DATASET_GROUP: "数据文件名无法作为分类名称，请使用字母、数字或中文命名",
    INVALID_DATASET_ENCODING: "数据文件必须使用 UTF-8 编码",
    INVALID_DATASET_CONTENT: "数据文件包含二进制或异常控制字符，请上传 UTF-8 文本数据",
    INVALID_DATASET_JSON: "数据源中的 JSON 文件格式不正确",
    INVALID_DATASET_JSONL: `JSONL / NDJSON 第 ${Number(error.message.split(":")[1]) || "?"} 行不是有效 JSON`,
    INVALID_DATASET_CSV: "CSV 文件格式不正确，请检查分隔符、引号和每行列数",
    INVALID_DATASET_TSV: "TSV 文件格式不正确，请检查制表符、引号和每行列数",
    INVALID_DATASET_YAML: "YAML / YML 文件格式不正确或包含过多别名引用",
    INVALID_DATASET_HEADERS: "CSV / TSV 表头不能为空或重复",
    EMPTY_DATASET_FILE: "数据文件中没有可调用的记录",
    UNSUPPORTED_DATASET_FILE: "通用数据源仅支持可解析的 UTF-8 数据文件或 ZIP 数据包",
    ASSETS_TOO_LARGE: `单次内容总大小不能超过 ${MAX_TOTAL_ASSET_BYTES / 1024 / 1024} MB`,
    ASSETS_REQUIRED: "请添加至少一项可返回的内容",
    PHP_PACKAGE_REQUIRED: "请选择包含 PHP 源码和附属文件的 ZIP 包",
    PHP_PACKAGE_TOO_LARGE: `PHP ZIP 包不能超过 ${MAX_PHP_PACKAGE_BYTES / 1024 / 1024} MB`,
    INVALID_PACKAGE_PATH: "ZIP 中包含不安全的文件路径",
    DUPLICATE_PACKAGE_PATH: "ZIP 中包含重复或仅大小写不同的文件路径",
    INVALID_PHP_ENTRY: "入口文件必须是 PHP 文件",
    INVALID_ZIP: "无法读取 ZIP 程序包",
    INVALID_PACKAGE_FILE_COUNT: "PHP 程序包必须包含 1 至 200 个文件",
    PACKAGE_FILE_TOO_LARGE: `程序包内单个文件不能超过 ${MAX_IMAGE_BYTES / 1024 / 1024} MB`,
    PHP_ENTRY_NOT_FOUND: error.message.includes(":") ? `ZIP 中没有找到指定入口：${error.message.split(":").slice(1).join(":")}` : "ZIP 中没有找到 PHP 文件，请确认程序包包含可执行的 .php 源文件",
    PHP_ENTRY_AMBIGUOUS: `ZIP 中存在多个可能的 PHP 入口，请填写完整相对路径：${error.message.split(":").slice(1).join(":").split("|").join("、")}`,
    PHP_EXTRACTED_TOO_LARGE: `PHP 程序包解压后不能超过 ${MAX_PHP_EXTRACTED_BYTES / 1024 / 1024} MB`,
  };
  return messages[errorCode] ?? null;
}

type DatasetConfig = {
  grouping?: "FILE" | "MERGED";
  contractMode?: "AUTO" | "MANUAL";
  categoryParameter?: string;
  formatParameter?: string;
  menuValue?: string;
  defaultFormat?: string;
  textField?: string;
  itemsPath?: string;
};

function objectConfig(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

type DatasetParameter = {
  location: "PATH" | "QUERY" | "BODY";
  name: string;
  upstreamName: string | null;
  dataType: string;
};

function dataPathSegments(path: string) {
  if (path.startsWith("/")) return path.slice(1).split("/").filter(Boolean).map((item) => item.replaceAll("~1", "/").replaceAll("~0", "~"));
  return path.replace(/\[(\d+)\]/g, ".$1").split(".").map((item) => item.trim()).filter(Boolean);
}

function dataPath(segments: readonly string[]) {
  if (segments.every((item) => item && !/[.[\]~/]/.test(item))) return segments.join(".");
  return `/${segments.map((item) => item.replaceAll("~", "~0").replaceAll("/", "~1")).join("/")}`;
}

function pathValue(value: unknown, path: string) {
  const segments = dataPathSegments(path);
  function read(current: unknown, index: number): unknown {
    if (index >= segments.length) return current;
    if (Array.isArray(current)) {
      if (/^\d+$/.test(segments[index])) return read(current[Number(segments[index])], index + 1);
      return current.map((item) => read(item, index)).flat().filter((item) => item !== undefined);
    }
    if (!current || typeof current !== "object") return undefined;
    return read((current as Record<string, unknown>)[segments[index]], index + 1);
  }
  return read(value, 0);
}

function bestArray(value: unknown) {
  const candidates: Array<{ items: unknown[]; depth: number }> = [];
  function visit(current: unknown, depth: number) {
    if (depth > 8) return;
    if (Array.isArray(current)) {
      candidates.push({ items: current, depth });
      for (const item of current.slice(0, 10)) visit(item, depth + 1);
      return;
    }
    if (!current || typeof current !== "object") return;
    for (const nested of Object.values(current as Record<string, unknown>)) visit(nested, depth + 1);
  }
  visit(value, 0);
  return candidates.sort((left, right) => {
    const score = (candidate: typeof left) => {
      const populated = candidate.items.filter((item) => item !== null && item !== undefined);
      const objects = populated.filter((item) => item && typeof item === "object" && !Array.isArray(item)).length;
      return (objects ? 10_000 + objects * 100 : populated.length * 10) - candidate.depth;
    };
    return score(right) - score(left);
  })[0]?.items ?? null;
}

function datasetItems(asset: { mimeType: string; data: Uint8Array }, itemsPath: string) {
  const text = Buffer.from(asset.data).toString("utf8");
  if (!asset.mimeType.includes("json")) return itemsPath ? [] : text.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  const value: unknown = JSON.parse(text);
  if (itemsPath) {
    const selected = pathValue(value, itemsPath);
    if (Array.isArray(selected)) return selected.filter(usableDatasetValue);
    const mapped = mappedObjectItems(selected);
    if (mapped) return mapped;
    return usableDatasetValue(selected) ? [selected] : [];
  }
  const mapped = mappedObjectItems(value);
  if (mapped) return mapped;
  const array = bestArray(value);
  return array ? array.filter(usableDatasetValue) : usableDatasetValue(value) ? [value] : [];
}

const recordFieldNames = new Set(["id", "uuid", "key", "code", "name", "title", "text", "content", "message", "value", "label", "description", "status", "type"]);

function usableDatasetValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return Boolean(value.trim());
  if (Array.isArray(value)) return value.some(usableDatasetValue);
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
}

function mappedObjectItems(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>).filter(([, item]) => usableDatasetValue(item));
  if (entries.length < 2) return null;
  const values = entries.map(([, item]) => item);
  if (values.every(Array.isArray)) return values.flat().filter(usableDatasetValue);
  if (values.every((item) => item && typeof item === "object" && !Array.isArray(item))) {
    const signatures = values.map((item) => new Set(Object.keys(item as Record<string, unknown>)));
    if (signatures[0].size && [...signatures[0]].some((key) => signatures.slice(1).every((signature) => signature.has(key)))) return values;
  }
  if (values.every((item) => ["string", "number", "boolean"].includes(typeof item)) && !entries.some(([key]) => recordFieldNames.has(key.toLowerCase()))) return values;
  return null;
}

function datasetText(value: unknown, textField: string) {
  if (["string", "number", "boolean"].includes(typeof value)) return String(value);
  if (!value || typeof value !== "object") return "";
  if (textField) {
    const selected = pathValue(value, textField);
    if (["string", "number", "boolean"].includes(typeof selected)) return String(selected);
  }
  const record = value as Record<string, unknown>;
  for (const key of ["text", "content", "message", "value", "title", "name", "label", "description"]) {
    if (["string", "number", "boolean"].includes(typeof record[key])) return String(record[key]);
  }
  const strings = Object.entries(record)
    .filter(([key, item]) => typeof item === "string" && item.trim() && !/(?:^|_)(?:id|uuid|key|code)$/i.test(key))
    .map(([, item]) => item as string)
    .sort((left, right) => right.length - left.length);
  if (strings[0]) return strings[0];
  return JSON.stringify(value);
}

export function preparedContentResponseExample(handler: ContentHandlerId, assets: readonly { mimeType: string; data: Uint8Array }[], executionConfig: unknown, responseFormats: readonly string[]) {
  const asset = assets[0];
  if (!asset || ["content.random-image", "content.random-video"].includes(handler)) return undefined;
  if (handler === "content.random-text") return Buffer.from(asset.data).toString("utf8");
  if (handler === "content.static-json") return JSON.parse(Buffer.from(asset.data).toString("utf8")) as unknown;
  if (handler !== "content.dataset") return undefined;
  const rootConfig = objectConfig(executionConfig);
  const config = objectConfig(rootConfig.dataset) as DatasetConfig;
  const itemsPath = config.itemsPath?.trim() || "";
  const item = assets.reduce<unknown>((sample, candidate) => sample ?? datasetItems(candidate, itemsPath)[0], undefined);
  if (item === undefined) return undefined;
  const defaultFormat = config.defaultFormat === "TXT" && responseFormats.includes("TXT") ? "TXT" : responseFormats.includes("JSON") ? "JSON" : responseFormats[0];
  return defaultFormat === "TXT" ? datasetText(item, config.textField?.trim() || "") : item;
}

const MAX_INFERRED_FIELDS = 40;
const MAX_INFERENCE_RECORDS = 100;

function inferredDataType(values: readonly unknown[]): ApiDataType {
  const types = new Set(values.filter((value) => value !== null && value !== undefined).map((value) => {
    if (Array.isArray(value)) return "array";
    if (value && typeof value === "object") return "object";
    if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
    if (typeof value === "boolean") return "boolean";
    return "string";
  }));
  if (!types.size) return "string";
  if (types.size === 1) return [...types][0] as ApiDataType;
  if ([...types].every((type) => type === "integer" || type === "number")) return "number";
  return "string";
}

function collectFilterValues(value: unknown, segments: string[], fields: Map<string, { segments: string[]; values: unknown[] }>, depth = 0) {
  if (value === null || value === undefined || depth > 8 || fields.size >= MAX_INFERRED_FIELDS * 2) return;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 20)) collectFilterValues(item, segments, fields, depth + 1);
    return;
  }
  if (typeof value === "object") {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>).slice(0, MAX_INFERRED_FIELDS * 2)) collectFilterValues(nested, [...segments, key], fields, depth + 1);
    return;
  }
  if (!segments.length) return;
  const path = dataPath(segments);
  if (path.length > 160) return;
  const field = fields.get(path) ?? { segments, values: [] };
  if (field.values.length < MAX_INFERENCE_RECORDS) field.values.push(value);
  fields.set(path, field);
}

function parameterName(segments: readonly string[], leafCounts: ReadonlyMap<string, number>, used: Set<string>) {
  const leaf = segments.at(-1) ?? "field";
  const preferred = leafCounts.get(leaf) === 1 ? leaf : segments.join("_");
  const normalized = preferred.normalize("NFKC").replace(/[^\p{L}\p{N}_-]+/gu, "_").replace(/^_+|_+$/g, "");
  const base = (/^[\p{L}_]/u.test(normalized) ? normalized : `field_${normalized || "value"}`).slice(0, 76);
  let candidate = base;
  for (let suffix = 2; used.has(candidate); suffix += 1) candidate = `${base.slice(0, 76 - String(suffix).length)}_${suffix}`;
  used.add(candidate);
  return candidate;
}

export function inferPreparedDatasetContract(assets: readonly { mimeType: string; data: Uint8Array }[], executionConfig: unknown) {
  const rootConfig = objectConfig(executionConfig);
  const config = objectConfig(rootConfig.dataset) as DatasetConfig;
  const itemsPath = config.itemsPath?.trim() || "";
  const records: unknown[] = [];
  for (const asset of assets) {
    records.push(...datasetItems(asset, itemsPath).slice(0, MAX_INFERENCE_RECORDS - records.length));
    if (records.length >= MAX_INFERENCE_RECORDS) break;
  }

  const responseValues = new Map<string, unknown[]>();
  for (const record of records) {
    if (record && typeof record === "object" && !Array.isArray(record)) {
      for (const [name, value] of Object.entries(record as Record<string, unknown>).slice(0, MAX_INFERRED_FIELDS)) {
        if (name.length > 120) continue;
        const values = responseValues.get(name) ?? [];
        values.push(value);
        responseValues.set(name, values);
      }
    } else {
      const values = responseValues.get("value") ?? [];
      values.push(record);
      responseValues.set("value", values);
    }
  }
  const responseParameters: ApiResponseParameter[] = [...responseValues.entries()].slice(0, MAX_INFERRED_FIELDS).map(([name, values]) => ({
    name,
    dataType: inferredDataType(values),
    description: name === "value" ? "数据源返回值" : `数据源字段 ${name}`,
  }));

  const parameters: ApiRequestParameter[] = [];
  const usedNames = new Set<string>();
  const addControlParameter = (name: string, description: string, defaultValue = "", pattern = "") => {
    if (!name || name.length > 80 || usedNames.has(name)) return;
    usedNames.add(name);
    parameters.push({ location: "QUERY", name, upstreamName: "", required: false, dataType: "string", defaultValue, description, pattern, sensitive: false });
  };
  if (config.grouping === "FILE") addControlParameter(config.categoryParameter?.trim() || "", "选择文件分组；使用列表触发值可查看全部分组");
  addControlParameter(config.formatParameter?.trim() || "", "返回格式，可选 txt 或 json；留空时使用 Accept 请求头或接口默认格式", "", "^(txt|TXT|json|JSON)$");

  const filterFields = new Map<string, { segments: string[]; values: unknown[] }>();
  for (const record of records) collectFilterValues(record, [], filterFields);
  const leafCounts = new Map<string, number>();
  for (const { segments } of filterFields.values()) leafCounts.set(segments.at(-1)!, (leafCounts.get(segments.at(-1)!) ?? 0) + 1);
  for (const [path, field] of filterFields) {
    if (parameters.length >= MAX_INFERRED_FIELDS) break;
    const name = parameterName(field.segments, leafCounts, usedNames);
    parameters.push({ location: "QUERY", name, upstreamName: path, required: false, dataType: inferredDataType(field.values), defaultValue: "", description: `按数据字段 ${path} 精确筛选`, pattern: "", sensitive: false });
  }
  return { parameters, responseParameters };
}

function datasetInputValue(query: URLSearchParams, body: unknown, name: string) {
  if (!name) return "";
  if (query.has(name)) return query.get(name) ?? "";
  return body && typeof body === "object" && !Array.isArray(body) ? String((body as Record<string, unknown>)[name] ?? "") : "";
}

function parameterInputValue(parameter: DatasetParameter, query: URLSearchParams, body: unknown, pathParams: Record<string, string>) {
  if (parameter.location === "PATH") return pathParams[parameter.name];
  if (parameter.location === "QUERY") return query.get(parameter.name) ?? undefined;
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>)[parameter.name] : undefined;
}

function filterMatches(actual: unknown, expected: unknown, dataType: string): boolean {
  if (Array.isArray(actual)) return actual.some((item) => filterMatches(item, expected, dataType));
  if (dataType === "boolean") return String(actual).toLowerCase() === String(expected).toLowerCase() || Number(actual) === Number(expected);
  if (dataType === "integer" || dataType === "number") return Number(actual) === Number(expected);
  if (dataType === "array" || dataType === "object") {
    try { return JSON.stringify(actual) === JSON.stringify(typeof expected === "string" ? JSON.parse(expected) : expected); }
    catch { return false; }
  }
  return String(actual) === String(expected);
}

async function datasetResponse(productId: string, request: Request, executionConfig: unknown, parsedBody: unknown, requestQuery?: URLSearchParams, parameters: DatasetParameter[] = [], pathParams: Record<string, string> = {}, responseFormats: readonly string[] = ["TXT", "JSON"]) {
  const rootConfig = objectConfig(executionConfig);
  const config = objectConfig(rootConfig.dataset) as DatasetConfig;
  const grouping = config.grouping === "FILE" ? "FILE" : "MERGED";
  const categoryParameter = typeof config.categoryParameter === "string" ? config.categoryParameter.trim() : "";
  const formatParameter = typeof config.formatParameter === "string" ? config.formatParameter.trim() : "";
  const menuValue = config.menuValue?.trim() || "";
  const allowedFormats = ["TXT", "JSON"].filter((format) => responseFormats.includes(format));
  const configuredDefault = config.defaultFormat?.toUpperCase() === "TXT" ? "TXT" : "JSON";
  const defaultFormat = allowedFormats.includes(configuredDefault) ? configuredDefault : allowedFormats[0];
  if (!defaultFormat) throw new Error("CONTENT_FORMAT_NOT_CONFIGURED");
  const query = requestQuery ?? new URL(request.url).searchParams;
  const requestedCategory = grouping === "FILE" ? datasetInputValue(query, parsedBody, categoryParameter).trim() : "";
  const requestedFormat = datasetInputValue(query, parsedBody, formatParameter).trim().toUpperCase();
  const accept = request.headers.get("accept")?.toLowerCase() ?? "";
  const negotiatedFormat = !requestedFormat && accept.includes("text/plain") && allowedFormats.includes("TXT") ? "TXT" : !requestedFormat && accept.includes("application/json") && allowedFormats.includes("JSON") ? "JSON" : defaultFormat;
  const format = requestedFormat || negotiatedFormat;
  if (!allowedFormats.includes(format)) return { response: Response.json({ code: "INVALID_FORMAT", message: `${formatParameter || "请求的返回格式"} 仅支持 ${allowedFormats.map((item) => item.toLowerCase()).join(" 或 ")}` }, { status: 400 }), responseBytes: BigInt(0) };
  const groups = await prisma.apiAsset.groupBy({ by: ["groupKey"], where: { productId, kind: "DATASET" }, _count: { _all: true }, orderBy: { groupKey: "asc" } });
  if (!groups.length) throw new Error("CONTENT_NOT_CONFIGURED");
  if (grouping === "FILE" && categoryParameter && menuValue && requestedCategory === menuValue) {
    const categories = groups.map((group) => group.groupKey);
    const payload = format === "JSON" ? JSON.stringify({ categories }) : categories.join("\n");
    return { response: new Response(payload, { status: 200, headers: { "Content-Type": format === "JSON" ? "application/json; charset=utf-8" : "text/plain; charset=utf-8" } }), responseBytes: BigInt(Buffer.byteLength(payload)) };
  }
  if (requestedCategory && !groups.some((group) => group.groupKey === requestedCategory)) {
    const payload = JSON.stringify({ code: "DATASET_GROUP_NOT_FOUND", message: `分类 ${requestedCategory} 不存在`, categories: groups.map((group) => group.groupKey) });
    return { response: new Response(payload, { status: 404, headers: { "Content-Type": "application/json; charset=utf-8" } }), responseBytes: BigInt(Buffer.byteLength(payload)) };
  }
  const assets = await prisma.apiAsset.findMany({ where: { productId, kind: "DATASET", ...(requestedCategory ? { groupKey: requestedCategory } : {}) }, orderBy: { createdAt: "asc" }, select: { groupKey: true, mimeType: true, data: true } });
  const filters = parameters.flatMap((parameter) => {
    if (!parameter.upstreamName || [categoryParameter, formatParameter].includes(parameter.name)) return [];
    const expected = parameterInputValue(parameter, query, parsedBody, pathParams);
    return expected === undefined || expected === null || expected === "" ? [] : [{ parameter, expected }];
  });
  const candidates = assets.flatMap((asset) => datasetItems(asset, config.itemsPath?.trim() || "")
    .filter((item) => filters.every(({ parameter, expected }) => filterMatches(pathValue(item, parameter.upstreamName!), expected, parameter.dataType)))
    .map((item) => ({ item, groupKey: asset.groupKey })));
  if (!candidates.length) {
    if (!filters.length) throw new Error("CONTENT_NOT_CONFIGURED");
    const payload = JSON.stringify({ code: "DATASET_ITEM_NOT_FOUND", message: "没有匹配请求条件的数据", filters: filters.map(({ parameter }) => parameter.name) });
    return { response: new Response(payload, { status: 404, headers: { "Content-Type": "application/json; charset=utf-8" } }), responseBytes: BigInt(Buffer.byteLength(payload)) };
  }
  const selected = candidates[randomInt(candidates.length)];
  const payload = format === "JSON" ? JSON.stringify(selected.item) : datasetText(selected.item, config.textField?.trim() || "");
  return { response: new Response(payload, { status: 200, headers: { "Content-Type": format === "JSON" ? "application/json; charset=utf-8" : "text/plain; charset=utf-8", "X-Star-Dataset-Group": selected.groupKey } }), responseBytes: BigInt(Buffer.byteLength(payload)) };
}

export async function contentResponse(productId: string, handler: ContentHandlerId, request: Request, options: { executionConfig?: unknown; parsedBody?: unknown; query?: URLSearchParams; parameters?: DatasetParameter[]; pathParams?: Record<string, string>; responseFormats?: readonly string[] } = {}) {
  if (handler === "content.dataset") return datasetResponse(productId, request, options.executionConfig, options.parsedBody, options.query, options.parameters, options.pathParams, options.responseFormats);
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
