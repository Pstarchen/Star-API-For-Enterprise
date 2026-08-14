import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { decryptJson, encryptJson } from "@/lib/server/encryption";
import { prisma } from "@/lib/server/prisma";

const TOKEN_PATTERN = /^dl_[A-Za-z0-9_-]{32,}$/;

function directLinkPepper() {
  const pepper = process.env.API_KEY_PEPPER;
  if (!pepper && process.env.NODE_ENV === "production") throw new Error("API_KEY_PEPPER is required in production");
  return pepper ?? "local-development-only";
}

export function hashDirectLinkToken(token: string) {
  return createHash("sha256").update(`${token}:${directLinkPepper()}`).digest("hex");
}

export function issueDirectLinkToken() {
  const token = `dl_${randomBytes(32).toString("base64url")}`;
  return {
    token,
    tokenHash: hashDirectLinkToken(token),
    tokenEncrypted: encryptJson({ token }),
    prefix: token.slice(0, 14),
  };
}

export function revealDirectLinkToken(value: Uint8Array) {
  try {
    const token = decryptJson(value).token;
    return typeof token === "string" && TOKEN_PATTERN.test(token) ? token : null;
  } catch {
    return null;
  }
}

export async function authenticateDirectLink(token: string) {
  if (!TOKEN_PATTERN.test(token)) return null;
  const now = new Date();
  const link = await prisma.directLink.findUnique({
    where: { tokenHash: hashDirectLinkToken(token) },
    include: {
      subscription: { include: { app: { include: { tenant: true } } } },
      endpoint: { include: { version: { include: { product: true } } } },
    },
  });
  if (!link || link.status !== "ACTIVE" || (link.expiresAt && link.expiresAt <= now)) return null;
  if (link.subscription.status !== "ACTIVE" || link.subscription.app.status !== "active" || link.subscription.app.tenant.status !== "ACTIVE") return null;
  if (link.subscription.productId !== link.endpoint.version.productId || !["PUBLISHED", "GRAY"].includes(link.endpoint.version.product.status)) return null;

  const touched = await prisma.directLink.updateMany({
    where: { id: link.id, status: "ACTIVE", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    data: { lastUsedAt: now },
  });
  return touched.count ? link : null;
}
