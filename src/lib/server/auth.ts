import "server-only";

import { createHmac, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/server/prisma";

const SESSION_COOKIE = "star_api_session";
const SESSION_HOURS = 12;
const REMEMBERED_SESSION_DAYS = 30;

function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if ((!secret || secret.length < 32) && process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must contain at least 32 characters in production");
  }
  return secret ?? "local-development-session-secret-only";
}

function tokenHash(token: string) {
  return createHmac("sha256", sessionSecret()).update(token).digest("hex");
}

function secureCookieEnabled() {
  if (process.env.SESSION_COOKIE_SECURE !== undefined) {
    return process.env.SESSION_COOKIE_SECURE === "true";
  }
  return process.env.NODE_ENV === "production";
}

export async function createSession(userId: string, remember = false) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + (remember ? REMEMBERED_SESSION_DAYS * 24 : SESSION_HOURS) * 60 * 60 * 1000);

  await prisma.session.create({ data: { userId, tokenHash: tokenHash(token), expiresAt } });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: secureCookieEnabled(),
    sameSite: "lax",
    path: "/",
    priority: "high",
    ...(remember ? { expires: expiresAt } : {}),
  });
}

export async function destroyCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: tokenHash(token) } });
  cookieStore.delete(SESSION_COOKIE);
}

export async function getCurrentUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: tokenHash(token) },
    include: {
      user: {
        include: {
          memberships: {
            orderBy: { createdAt: "asc" },
            include: { tenant: true },
          },
        },
      },
    },
  });

  if (!session || session.expiresAt <= new Date() || session.user.status !== "ACTIVE") {
    if (session) await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  return session.user;
}

export async function requireUser(loginPath = "/login?next=/console") {
  const user = await getCurrentUser();
  if (!user) redirect(loginPath);
  return user;
}

export async function requireAdmin() {
  const user = await requireUser("/login?next=/admin");
  if (user.platformRole !== "ADMIN") redirect("/console?error=forbidden");
  return user;
}

export function hashAuthIdentifier(identifier: string) {
  return createHmac("sha256", sessionSecret()).update(identifier).digest("hex");
}
