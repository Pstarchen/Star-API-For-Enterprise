import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { createSession } from "@/lib/server/auth";
import { getIntegration } from "@/lib/server/integrations";
import { getPlatformConfig } from "@/lib/server/installation";
import { prisma } from "@/lib/server/prisma";
import { requestIp } from "@/lib/server/request";
import { getAuthPolicy } from "@/lib/server/auth-policy";

type GitHubProfile = { id: number; login: string; name: string | null };
type GitHubEmail = { email: string; primary: boolean; verified: boolean };

function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
function loginError(request: Request, code: string) { return Response.redirect(new URL(`/login?oauthError=${encodeURIComponent(code)}`, request.url)); }

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return loginError(request, "github_invalid_callback");
  const stateRecord = await prisma.oAuthState.findUnique({ where: { tokenHash: hash(state) } });
  if (!stateRecord || stateRecord.provider !== "github" || stateRecord.expiresAt <= new Date()) return loginError(request, "github_invalid_state");
  await prisma.oAuthState.delete({ where: { id: stateRecord.id } });

  const github = await getIntegration("github", true);
  const clientId = typeof github.publicConfig.clientId === "string" ? github.publicConfig.clientId : "";
  const clientSecret = typeof github.secrets.clientSecret === "string" ? github.secrets.clientSecret : "";
  if (!github.enabled || !clientId || !clientSecret) return loginError(request, "github_not_configured");
  const platform = await getPlatformConfig();
  const redirectUri = `${platform.publicUrl.replace(/\/+$/, "")}/api/v1/auth/github/callback`;

  try {
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri }), cache: "no-store" });
    const tokenBody = await tokenResponse.json() as { access_token?: string };
    if (!tokenResponse.ok || !tokenBody.access_token) return loginError(request, "github_token_failed");
    const headers = { Accept: "application/vnd.github+json", Authorization: `Bearer ${tokenBody.access_token}`, "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "Star-API" };
    const [profileResponse, emailsResponse] = await Promise.all([fetch("https://api.github.com/user", { headers, cache: "no-store" }), fetch("https://api.github.com/user/emails", { headers, cache: "no-store" })]);
    if (!profileResponse.ok || !emailsResponse.ok) return loginError(request, "github_profile_failed");
    const profile = await profileResponse.json() as GitHubProfile;
    const emails = await emailsResponse.json() as GitHubEmail[];
    const email = emails.find((item) => item.primary && item.verified)?.email ?? emails.find((item) => item.verified)?.email;
    if (!email) return loginError(request, "github_verified_email_required");
    const normalizedEmail = email.toLowerCase();
    const authPolicy = await getAuthPolicy();

    const user = await prisma.$transaction(async (transaction) => {
      const linked = await transaction.oAuthAccount.findUnique({ where: { provider_providerAccountId: { provider: "github", providerAccountId: String(profile.id) } }, include: { user: true } });
      if (linked) {
        if (linked.user.status !== "ACTIVE") throw new Error("ACCOUNT_SUSPENDED");
        await transaction.user.update({ where: { id: linked.user.id }, data: { lastLoginAt: new Date() } });
        return linked.user;
      }
      let target = await transaction.user.findUnique({ where: { email: normalizedEmail } });
      if (target?.status === "SUSPENDED") throw new Error("ACCOUNT_SUSPENDED");
      if (!target) {
        if (!authPolicy.registrationEnabled) throw new Error("REGISTRATION_DISABLED");
        target = await transaction.user.create({ data: { email: normalizedEmail, name: profile.name?.trim() || profile.login, accountType: "PERSONAL", emailVerifiedAt: new Date(), lastLoginAt: new Date() } });
        const tenant = await transaction.tenant.create({ data: { name: `${target.name}的个人空间`, type: "PERSONAL", status: "ACTIVE" } });
        await transaction.membership.create({ data: { userId: target.id, tenantId: tenant.id, role: "OWNER" } });
      }
      await transaction.oAuthAccount.create({ data: { userId: target.id, provider: "github", providerAccountId: String(profile.id), username: profile.login } });
      await transaction.auditLog.create({ data: { actorId: target.id, action: "auth.github.link", resource: "user", resourceId: target.id, ipAddress: requestIp(request), metadata: { githubUsername: profile.login } } });
      return target;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await createSession(user.id, true);
    return Response.redirect(new URL(user.platformRole === "ADMIN" && stateRecord.redirectPath === "/console" ? "/admin" : stateRecord.redirectPath, platform.publicUrl));
  } catch (error) {
    if (error instanceof Error && error.message === "ACCOUNT_SUSPENDED") return loginError(request, "account_suspended");
    if (error instanceof Error && error.message === "REGISTRATION_DISABLED") return loginError(request, "registration_disabled");
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return loginError(request, "github_account_conflict");
    return loginError(request, "github_login_failed");
  }
}
