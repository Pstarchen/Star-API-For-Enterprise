import "server-only";

import { randomBytes, randomInt } from "node:crypto";
import { hashAuthIdentifier } from "@/lib/server/auth";
import { EMAIL_VERIFICATION_EXPIRES_MINUTES } from "@/lib/email-templates";
import { prisma } from "@/lib/server/prisma";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const CODE_TTL_MS = EMAIL_VERIFICATION_EXPIRES_MINUTES * 60 * 1000;

async function storeEmailVerificationToken(userId: string, rawToken: string, ttlMs: number) {
  await prisma.emailVerificationToken.deleteMany({ where: { userId, usedAt: null } });
  await prisma.emailVerificationToken.create({ data: { userId, tokenHash: hashAuthIdentifier(rawToken), expiresAt: new Date(Date.now() + ttlMs) } });
  return rawToken;
}

export async function issueEmailVerificationToken(userId: string) {
  const rawToken = randomBytes(32).toString("base64url");
  return storeEmailVerificationToken(userId, rawToken, TOKEN_TTL_MS);
}

export async function issueEmailVerificationCode(userId: string) {
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  return storeEmailVerificationToken(userId, code, CODE_TTL_MS);
}

export async function consumeEmailVerificationToken(rawToken: string) {
  const tokenHash = hashAuthIdentifier(rawToken);
  return prisma.$transaction(async (transaction) => {
    const record = await transaction.emailVerificationToken.findUnique({ where: { tokenHash } });
    if (!record || record.usedAt || record.expiresAt <= new Date()) throw new Error("EMAIL_TOKEN_INVALID");
    const consumed = await transaction.emailVerificationToken.updateMany({ where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
    if (consumed.count !== 1) throw new Error("EMAIL_TOKEN_INVALID");
    return transaction.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date(), emailVerificationRequired: false }, select: { id: true, name: true, email: true, platformRole: true } });
  });
}

export async function consumeEmailVerificationCode(email: string, code: string) {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) throw new Error("EMAIL_CODE_INVALID");
  return consumeEmailVerificationTokenForUser(user.id, code);
}

async function consumeEmailVerificationTokenForUser(userId: string, rawToken: string) {
  const tokenHash = hashAuthIdentifier(rawToken);
  return prisma.$transaction(async (transaction) => {
    const record = await transaction.emailVerificationToken.findUnique({ where: { tokenHash } });
    if (!record || record.userId !== userId || record.usedAt || record.expiresAt <= new Date()) throw new Error("EMAIL_CODE_INVALID");
    const consumed = await transaction.emailVerificationToken.updateMany({ where: { id: record.id, userId, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
    if (consumed.count !== 1) throw new Error("EMAIL_CODE_INVALID");
    return transaction.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date(), emailVerificationRequired: false }, select: { id: true, name: true, email: true, platformRole: true } });
  });
}
