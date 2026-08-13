export type ImageSignature = {
  mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  extension: ".png" | ".jpg" | ".webp" | ".gif";
};

export type DetectedImageSignature = ImageSignature & {
  offset: number;
};

function ascii(bytes: Uint8Array, start: number, end: number) {
  return String.fromCharCode(...bytes.subarray(start, end));
}

function isIgnorablePrefixByte(byte: number) {
  return byte === 0x00 || byte === 0x09 || byte === 0x0a || byte === 0x0d || byte === 0x20;
}

function candidateOffsets(bytes: Uint8Array) {
  const offsets = [0];
  let offset = 0;
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) offset = 3;
  while (offset < Math.min(bytes.length, 64) && isIgnorablePrefixByte(bytes[offset])) offset += 1;
  if (offset && !offsets.includes(offset)) offsets.push(offset);
  return offsets;
}

export function detectImageSignatureWithOffset(bytes: Uint8Array): DetectedImageSignature | null {
  for (const offset of candidateOffsets(bytes)) {
    if (bytes.length >= offset + 8 && bytes[offset] === 0x89 && bytes[offset + 1] === 0x50 && bytes[offset + 2] === 0x4e && bytes[offset + 3] === 0x47) {
      return { mimeType: "image/png", extension: ".png", offset };
    }
    if (bytes.length >= offset + 3 && bytes[offset] === 0xff && bytes[offset + 1] === 0xd8 && bytes[offset + 2] === 0xff) {
      return { mimeType: "image/jpeg", extension: ".jpg", offset };
    }
    if (bytes.length >= offset + 12 && ascii(bytes, offset, offset + 4) === "RIFF" && ascii(bytes, offset + 8, offset + 12) === "WEBP") {
      return { mimeType: "image/webp", extension: ".webp", offset };
    }
    if (bytes.length >= offset + 6 && ["GIF87a", "GIF89a"].includes(ascii(bytes, offset, offset + 6))) {
      return { mimeType: "image/gif", extension: ".gif", offset };
    }
  }
  return null;
}

export function detectImageSignature(bytes: Uint8Array): ImageSignature | null {
  const detected = detectImageSignatureWithOffset(bytes);
  return detected ? { mimeType: detected.mimeType, extension: detected.extension } : null;
}
