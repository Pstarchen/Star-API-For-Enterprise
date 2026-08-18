import "server-only";

import { randomBytes, randomInt } from "node:crypto";
import { hashAuthIdentifier } from "@/lib/server/auth";

export const QQ_PENDING_LOGIN_EXPIRES_MINUTES = 15;
export const QQ_EMAIL_CODE_EXPIRES_MINUTES = 10;

export function createQqPendingToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashAuthIdentifier(token) };
}

export function createQqEmailCode() {
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  return { code, codeHash: hashAuthIdentifier(code) };
}

export function hashQqPendingToken(token: string) {
  return hashAuthIdentifier(token);
}

export function hashQqEmailCode(code: string) {
  return hashAuthIdentifier(code);
}

export function isLegacyQqSyntheticEmail(email: string) {
  return /^qq-[a-f0-9]{64}@oauth\.star-api\.invalid$/i.test(email);
}

export function isInternalQqEmail(email: string) {
  return /@oauth\.star-api\.invalid$/i.test(email);
}
