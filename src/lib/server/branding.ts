import "server-only";

const MAX_ICON_BYTES = 512 * 1024;
const MAX_HERO_BYTES = 5 * 1024 * 1024;
const MIN_HERO_WIDTH = 960;
const MIN_HERO_HEIGHT = 480;
const iconMimeTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/x-icon", "image/vnd.microsoft.icon"]);
const heroMimeTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

function jpegDimensions(data: Buffer) {
  let offset = 2;
  const startOfFrameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  while (offset + 8 < data.length) {
    if (data[offset] !== 0xff) { offset += 1; continue; }
    while (data[offset] === 0xff) offset += 1;
    const marker = data[offset++];
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > data.length) return null;
    const length = data.readUInt16BE(offset);
    if (length < 2 || offset + length > data.length) return null;
    if (startOfFrameMarkers.has(marker) && length >= 7) {
      return { width: data.readUInt16BE(offset + 5), height: data.readUInt16BE(offset + 3) };
    }
    offset += length;
  }
  return null;
}

function webpDimensions(data: Buffer) {
  if (data.length < 30) return null;
  const format = data.subarray(12, 16).toString("ascii");
  if (format === "VP8X") {
    return { width: data.readUIntLE(24, 3) + 1, height: data.readUIntLE(27, 3) + 1 };
  }
  if (format === "VP8 " && data.length >= 30 && data.subarray(23, 26).toString("hex") === "9d012a") {
    return { width: data.readUInt16LE(26) & 0x3fff, height: data.readUInt16LE(28) & 0x3fff };
  }
  if (format === "VP8L" && data.length >= 25 && data[20] === 0x2f) {
    return {
      width: 1 + (((data[22] & 0x3f) << 8) | data[21]),
      height: 1 + (((data[24] & 0x0f) << 10) | (data[23] << 2) | ((data[22] & 0xc0) >> 6)),
    };
  }
  return null;
}

function imageDimensions(mimeType: string, data: Buffer) {
  if (mimeType === "image/png" && data.length >= 24 && data.subarray(12, 16).toString("ascii") === "IHDR") {
    return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
  }
  if (mimeType === "image/jpeg") return jpegDimensions(data);
  if (mimeType === "image/webp") return webpDimensions(data);
  return null;
}

function parseImageDataUrl(value: string | undefined, acceptedMimeTypes: Set<string>, maximumBytes: number) {
  if (!value) return null;
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match || !acceptedMimeTypes.has(match[1])) throw new Error("UNSUPPORTED_ICON");

  const data = Buffer.from(match[2], "base64");
  if (data.length === 0 || data.length > maximumBytes) throw new Error("INVALID_IMAGE_SIZE");
  const hex = data.subarray(0, 12).toString("hex");
  const valid = (match[1] === "image/png" && hex.startsWith("89504e470d0a1a0a"))
    || (match[1] === "image/jpeg" && hex.startsWith("ffd8ff"))
    || (match[1] === "image/webp" && hex.startsWith("52494646") && hex.slice(16, 24) === "57454250")
    || ((match[1] === "image/x-icon" || match[1] === "image/vnd.microsoft.icon") && hex.startsWith("00000100"));
  if (!valid) throw new Error("INVALID_ICON_CONTENT");

  return { mimeType: match[1], data };
}

export function parseIconDataUrl(value: string | undefined) {
  return parseImageDataUrl(value, iconMimeTypes, MAX_ICON_BYTES);
}

export function parseHeroDataUrl(value: string | undefined) {
  const image = parseImageDataUrl(value, heroMimeTypes, MAX_HERO_BYTES);
  if (!image) return null;
  const dimensions = imageDimensions(image.mimeType, image.data);
  if (!dimensions || dimensions.width < MIN_HERO_WIDTH || dimensions.height < MIN_HERO_HEIGHT) {
    throw new Error("INVALID_HERO_DIMENSIONS");
  }
  return image;
}
