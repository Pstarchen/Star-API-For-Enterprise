import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const VERSION = 1;

function encryptionKey() {
  const configured = process.env.CONFIG_ENCRYPTION_KEY;
  if (configured) {
    if (/^[a-f0-9]{64}$/i.test(configured)) return Buffer.from(configured, "hex");
    const decoded = Buffer.from(configured, "base64");
    if (decoded.length === 32) return decoded;
  }
  const sessionSecret = process.env.SESSION_SECRET;
  if (sessionSecret && sessionSecret.length >= 32) return createHash("sha256").update(`integration:${sessionSecret}`).digest();
  if (process.env.NODE_ENV === "production") throw new Error("CONFIG_ENCRYPTION_KEY or a strong SESSION_SECRET is required");
  return createHash("sha256").update("star-api-local-encryption-only").digest();
}

export function encryptJson(value: Record<string, unknown>) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), ciphertext]);
}

export function decryptJson(value: Uint8Array | null | undefined): Record<string, unknown> {
  if (!value) return {};
  const buffer = Buffer.from(value);
  if (buffer.length < 30 || buffer[0] !== VERSION) throw new Error("Unsupported encrypted configuration");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), buffer.subarray(1, 13));
  decipher.setAuthTag(buffer.subarray(13, 29));
  const plaintext = Buffer.concat([decipher.update(buffer.subarray(29)), decipher.final()]).toString("utf8");
  const parsed: unknown = JSON.parse(plaintext);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid encrypted configuration");
  return parsed as Record<string, unknown>;
}
