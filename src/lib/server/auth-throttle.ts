import "server-only";

import { hashAuthIdentifier } from "@/lib/server/auth";
import { prisma } from "@/lib/server/prisma";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 6;

function keyFor(email: string, ipAddress: string | null) {
  return hashAuthIdentifier(`${email}:${ipAddress ?? "unknown"}`);
}

export async function checkLoginThrottle(email: string, ipAddress: string | null) {
  const key = keyFor(email, ipAddress);
  const record = await prisma.authThrottle.findUnique({ where: { key } });
  const now = new Date();
  return Boolean(record?.blockedUntil && record.blockedUntil > now);
}

export async function recordFailedLogin(email: string, ipAddress: string | null) {
  const key = keyFor(email, ipAddress);
  const now = new Date();
  const record = await prisma.authThrottle.findUnique({ where: { key } });

  if (!record || now.getTime() - record.windowStartedAt.getTime() >= WINDOW_MS) {
    await prisma.authThrottle.upsert({
      where: { key },
      create: { key, attempts: 1, windowStartedAt: now },
      update: { attempts: 1, windowStartedAt: now, blockedUntil: null },
    });
    return;
  }

  const attempts = record.attempts + 1;
  await prisma.authThrottle.update({
    where: { key },
    data: {
      attempts,
      blockedUntil: attempts >= MAX_ATTEMPTS ? new Date(now.getTime() + WINDOW_MS) : null,
    },
  });
}

export async function clearLoginThrottle(email: string, ipAddress: string | null) {
  await prisma.authThrottle.deleteMany({ where: { key: keyFor(email, ipAddress) } });
}
