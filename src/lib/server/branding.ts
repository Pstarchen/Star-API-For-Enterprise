import "server-only";

const MAX_ICON_BYTES = 512 * 1024;
const MAX_HERO_BYTES = 5 * 1024 * 1024;
const iconMimeTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/x-icon", "image/vnd.microsoft.icon"]);
const heroMimeTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

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
  return parseImageDataUrl(value, heroMimeTypes, MAX_HERO_BYTES);
}
