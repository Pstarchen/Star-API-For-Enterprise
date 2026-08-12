import "server-only";

import { Prisma } from "@prisma/client";
import { hashAuthIdentifier } from "@/lib/server/auth";
import { prisma } from "@/lib/server/prisma";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 6;
const EMAIL_MAX_ATTEMPTS = 3;

function keyFor(email: string, ipAddress: string | null) {
  return hashAuthIdentifier(`${email}:${ipAddress ?? "unknown"}`);
}

function emailVerificationKey(email: string, ipAddress: string | null) {
  return hashAuthIdentifier(`email-verification:${email}:${ipAddress ?? "unknown"}`);
}

export async function checkLoginThrottle(email: string, ipAddress: string | null) {
  const key = keyFor(email, ipAddress);
  const record = await prisma.authThrottle.findUnique({ where: { key } });
  const now = new Date();
  return Boolean(record?.blockedUntil && record.blockedUntil > now);
}

export async function recordFailedLogin(email: string, ipAddress: string | null) {
  await recordThrottleAttempt(keyFor(email, ipAddress), MAX_ATTEMPTS);
}

export async function clearLoginThrottle(email: string, ipAddress: string | null) {
  await prisma.authThrottle.deleteMany({ where: { key: keyFor(email, ipAddress) } });
}

export async function checkEmailVerificationThrottle(email: string, ipAddress: string | null) {
  const record = await prisma.authThrottle.findUnique({ where: { key: emailVerificationKey(email, ipAddress) } });
  return Boolean(record?.blockedUntil && record.blockedUntil > new Date());
}

export async function recordEmailVerificationRequest(email: string, ipAddress: string | null) {
  await recordThrottleAttempt(emailVerificationKey(email, ipAddress), EMAIL_MAX_ATTEMPTS);
}

async function recordThrottleAttempt(key: string, maximumAttempts: number) {
  const now = new Date();
  const cutoff = new Date(now.getTime() - WINDOW_MS);
  const blockedUntil = new Date(now.getTime() + WINDOW_MS);
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "AuthThrottle" ("key", "attempts", "windowStartedAt", "blockedUntil", "updatedAt")
    VALUES (${key}, 1, ${now}, NULL, ${now})
    ON CONFLICT ("key") DO UPDATE SET
      "attempts" = CASE
        WHEN "AuthThrottle"."windowStartedAt" <= ${cutoff} THEN 1
        ELSE "AuthThrottle"."attempts" + 1
      END,
      "windowStartedAt" = CASE
        WHEN "AuthThrottle"."windowStartedAt" <= ${cutoff} THEN ${now}
        ELSE "AuthThrottle"."windowStartedAt"
      END,
      "blockedUntil" = CASE
        WHEN "AuthThrottle"."windowStartedAt" <= ${cutoff} THEN NULL
        WHEN "AuthThrottle"."attempts" + 1 >= ${maximumAttempts} THEN ${blockedUntil}
        ELSE NULL
      END,
      "updatedAt" = ${now}
  `);
}
