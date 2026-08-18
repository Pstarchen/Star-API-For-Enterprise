import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { absoluteOAuthUrl, OAUTH_FRONTEND_CALLBACK_PATH, QQ_OAUTH_CALLBACK_PATH } from "@/lib/oauth";
import { parseQqJson, parseQqTokenResponse, qqProviderAccountId, type QqOpenIdResponse, type QqUserProfile } from "@/lib/qq-oauth";
import { createQqPendingToken, isLegacyQqSyntheticEmail, QQ_PENDING_LOGIN_EXPIRES_MINUTES } from "@/lib/server/qq-pending";
import { createSession } from "@/lib/server/auth";
import { getIntegration } from "@/lib/server/integrations";
import { getPlatformConfig } from "@/lib/server/installation";
import { prisma } from "@/lib/server/prisma";

function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
function loginError(request: Request, code: string) { return Response.redirect(new URL(`/login?oauthError=${encodeURIComponent(code)}`, request.url)); }

function completionUrl(publicUrl: string, redirectPath: string) {
  const url = new URL(absoluteOAuthUrl(publicUrl, OAUTH_FRONTEND_CALLBACK_PATH));
  url.searchParams.set("provider", "qq");
  url.searchParams.set("next", redirectPath);
  return url;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (url.searchParams.get("error")) return loginError(request, "qq_authorization_denied");
  if (!code || !state) return loginError(request, "qq_invalid_callback");
  const stateRecord = await prisma.oAuthState.findUnique({ where: { tokenHash: hash(state) } });
  if (!stateRecord || stateRecord.provider !== "qq" || stateRecord.expiresAt <= new Date()) return loginError(request, "qq_invalid_state");
  await prisma.oAuthState.delete({ where: { id: stateRecord.id } });

  const qq = await getIntegration("qq", true);
  const clientId = typeof qq.publicConfig.clientId === "string" ? qq.publicConfig.clientId.trim() : "";
  const clientSecret = typeof qq.secrets.clientSecret === "string" ? qq.secrets.clientSecret : "";
  if (!qq.enabled || !clientId || !clientSecret) return loginError(request, "qq_not_configured");
  const platform = await getPlatformConfig();
  const publicUrl = platform.publicUrl || new URL(request.url).origin;
  const redirectUri = absoluteOAuthUrl(publicUrl, QQ_OAUTH_CALLBACK_PATH);

  try {
    const tokenUrl = new URL("https://graph.qq.com/oauth2.0/token");
    tokenUrl.searchParams.set("grant_type", "authorization_code");
    tokenUrl.searchParams.set("client_id", clientId);
    tokenUrl.searchParams.set("client_secret", clientSecret);
    tokenUrl.searchParams.set("code", code);
    tokenUrl.searchParams.set("redirect_uri", redirectUri);
    tokenUrl.searchParams.set("fmt", "json");
    const tokenResponse = await fetch(tokenUrl, { cache: "no-store" });
    const tokenBody = parseQqTokenResponse(await tokenResponse.text());
    if (!tokenResponse.ok || !tokenBody?.access_token) return loginError(request, "qq_token_failed");

    const openIdUrl = new URL("https://graph.qq.com/oauth2.0/me");
    openIdUrl.searchParams.set("access_token", tokenBody.access_token);
    openIdUrl.searchParams.set("fmt", "json");
    const openIdResponse = await fetch(openIdUrl, { cache: "no-store" });
    const openIdBody = parseQqJson<QqOpenIdResponse>(await openIdResponse.text());
    const openid = typeof openIdBody?.openid === "string" ? openIdBody.openid.trim() : "";
    if (!openIdResponse.ok || !openid || (openIdBody?.client_id && String(openIdBody.client_id) !== clientId)) return loginError(request, "qq_openid_failed");

    const profileUrl = new URL("https://graph.qq.com/user/get_user_info");
    profileUrl.searchParams.set("access_token", tokenBody.access_token);
    profileUrl.searchParams.set("oauth_consumer_key", clientId);
    profileUrl.searchParams.set("openid", openid);
    const profileResponse = await fetch(profileUrl, { cache: "no-store" });
    const profile = parseQqJson<QqUserProfile>(await profileResponse.text());
    if (!profileResponse.ok || !profile || Number(profile.ret) !== 0) return loginError(request, "qq_profile_failed");

    const nickname = typeof profile.nickname === "string" ? profile.nickname.trim().slice(0, 120) : "";
    const providerAccountId = qqProviderAccountId(clientId, openid);
    const linked = await prisma.oAuthAccount.findUnique({ where: { provider_providerAccountId: { provider: "qq", providerAccountId } }, include: { user: true } });
    if (linked?.user.status === "SUSPENDED") return loginError(request, "account_suspended");

    if (linked && linked.user.emailVerifiedAt && !isLegacyQqSyntheticEmail(linked.user.email)) {
      await prisma.user.update({ where: { id: linked.user.id }, data: { lastLoginAt: new Date() } });
      await createSession(linked.user.id, true);
      const destination = linked.user.platformRole === "ADMIN" && stateRecord.redirectPath === "/console" ? "/admin" : stateRecord.redirectPath;
      return Response.redirect(completionUrl(publicUrl, destination));
    }

    const pending = createQqPendingToken();
    await prisma.$transaction(async (transaction) => {
      await transaction.oAuthPendingLogin.deleteMany({ where: { provider: "qq", providerAccountId } });
      await transaction.oAuthPendingLogin.create({
        data: {
          provider: "qq",
          providerAccountId,
          username: nickname || "QQ 用户",
          redirectPath: stateRecord.redirectPath,
          tokenHash: pending.tokenHash,
          expiresAt: new Date(Date.now() + QQ_PENDING_LOGIN_EXPIRES_MINUTES * 60 * 1000),
        },
      });
    });

    const bindUrl = new URL("/auth/oauth/qq/bind", publicUrl);
    bindUrl.searchParams.set("token", pending.token);
    return Response.redirect(bindUrl);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return loginError(request, "qq_account_conflict");
    return loginError(request, "qq_login_failed");
  }
}
