import "server-only";

import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(nodeScrypt);
const KEY_LENGTH = 64;
const FORMAT = "scrypt-v1";

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derivedKey = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return `${FORMAT}$${salt.toString("base64url")}$${derivedKey.toString("base64url")}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [format, encodedSalt, encodedKey] = storedHash.split("$");
  if (format !== FORMAT || !encodedSalt || !encodedKey) return false;

  try {
    const salt = Buffer.from(encodedSalt, "base64url");
    const expectedKey = Buffer.from(encodedKey, "base64url");
    if (expectedKey.length !== KEY_LENGTH) return false;
    const actualKey = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
    return timingSafeEqual(actualKey, expectedKey);
  } catch {
    return false;
  }
}
