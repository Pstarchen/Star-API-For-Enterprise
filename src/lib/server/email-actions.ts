import "server-only";

import { randomBytes, randomInt } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { hashAuthIdentifier } from "@/lib/server/auth";
import { prisma } from "@/lib/server/prisma";

export const emailActionPurposes = ["PASSWORD_RESET", "NOTIFICATION_EMAIL"] as const;
export type EmailActionPurpose = (typeof emailActionPurposes)[number];

export async function issueEmailAction(input: { purpose: EmailActionPurpose; userId?: string; tenantId?: string; targetEmail?: string; expiresInMinutes: number; format: "token" | "code" }) {
  if (!input.userId && !input.tenantId) throw new Error("EMAIL_ACTION_SUBJECT_REQUIRED");
  const raw = input.format === "code" ? randomInt(0, 1_000_000).toString().padStart(6, "0") : randomBytes(32).toString("base64url");
  await prisma.$transaction(async (transaction) => {
    await transaction.emailActionToken.deleteMany({ where: { purpose: input.purpose, userId: input.userId ?? null, tenantId: input.tenantId ?? null, usedAt: null } });
    await transaction.emailActionToken.create({ data: { purpose: input.purpose, userId: input.userId, tenantId: input.tenantId, targetEmail: input.targetEmail?.trim().toLowerCase(), tokenHash: hashAuthIdentifier(raw), expiresAt: new Date(Date.now() + input.expiresInMinutes * 60 * 1000) } });
  });
  return raw;
}

export async function consumeEmailAction<T>(input: { purpose: EmailActionPurpose; raw: string; userId?: string; tenantId?: string; targetEmail?: string }, action: (transaction: Prisma.TransactionClient, record: { id: string; userId: string | null; tenantId: string | null; targetEmail: string | null }) => Promise<T>) {
  const tokenHash = hashAuthIdentifier(input.raw);
  return prisma.$transaction(async (transaction) => {
    const record = await transaction.emailActionToken.findUnique({ where: { tokenHash }, select: { id: true, purpose: true, userId: true, tenantId: true, targetEmail: true, usedAt: true, expiresAt: true } });
    if (!record || record.purpose !== input.purpose || record.usedAt || record.expiresAt <= new Date()) throw new Error("EMAIL_ACTION_INVALID");
    if (input.userId && record.userId !== input.userId) throw new Error("EMAIL_ACTION_INVALID");
    if (input.tenantId && record.tenantId !== input.tenantId) throw new Error("EMAIL_ACTION_INVALID");
    if (input.targetEmail && record.targetEmail !== input.targetEmail.trim().toLowerCase()) throw new Error("EMAIL_ACTION_INVALID");
    const consumed = await transaction.emailActionToken.updateMany({ where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
    if (consumed.count !== 1) throw new Error("EMAIL_ACTION_INVALID");
    return action(transaction, record);
  });
}
