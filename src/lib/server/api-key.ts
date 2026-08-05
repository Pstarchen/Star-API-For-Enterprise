import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/server/prisma";

export type KeyEnvironment = "test" | "live";

export function issueApiKey(environment: KeyEnvironment) {
  const prefix = `sk_${environment}_`;
  const secret = `${prefix}${randomBytes(24).toString("base64url")}`;
  const pepper = process.env.API_KEY_PEPPER;
  if (!pepper && process.env.NODE_ENV === "production") {
    throw new Error("API_KEY_PEPPER is required in production");
  }
  const effectivePepper = pepper ?? "local-development-only";
  const secretHash = hashApiKey(secret, effectivePepper);

  return {
    secret,
    secretHash,
    prefix: secret.slice(0, prefix.length + 8),
  };
}

export function hashApiKey(secret: string, pepper = process.env.API_KEY_PEPPER ?? "local-development-only") {
  return createHash("sha256").update(`${secret}:${pepper}`).digest("hex");
}

export async function authenticateApiKey(secret: string) {
  if (!/^sk_(test|live)_[A-Za-z0-9_-]{20,}$/.test(secret)) return null;
  const key = await prisma.apiKey.findFirst({
    where: {
      prefix: secret.slice(0, 16),
      secretHash: hashApiKey(secret),
      status: "ACTIVE",
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      app: { status: "active", tenant: { status: "ACTIVE" } },
    },
    include: { app: { include: { tenant: true } } },
  });
  if (!key) return null;
  await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
  return key;
}
