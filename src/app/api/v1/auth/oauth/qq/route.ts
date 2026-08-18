import { createHash, randomBytes } from "node:crypto";
import { absoluteOAuthUrl, QQ_OAUTH_CALLBACK_PATH, QQ_OAUTH_SCOPE, safeOAuthNext } from "@/lib/oauth";
import { getIntegration } from "@/lib/server/integrations";
import { getPlatformConfig } from "@/lib/server/installation";
import { prisma } from "@/lib/server/prisma";

function stateHash(value: string) { return createHash("sha256").update(value).digest("hex"); }

export async function GET(request: Request) {
  const qq = await getIntegration("qq");
  const clientId = typeof qq.publicConfig.clientId === "string" ? qq.publicConfig.clientId.trim() : "";
  if (!qq.enabled || !qq.configured || !clientId) return Response.redirect(new URL("/login?oauthError=qq_not_configured", request.url));

  const state = randomBytes(32).toString("base64url");
  await prisma.$transaction([
    prisma.oAuthState.deleteMany({ where: { expiresAt: { lte: new Date() } } }),
    prisma.oAuthState.create({ data: { provider: "qq", tokenHash: stateHash(state), redirectPath: safeOAuthNext(new URL(request.url).searchParams.get("next")), expiresAt: new Date(Date.now() + 10 * 60 * 1000) } }),
  ]);

  const platform = await getPlatformConfig();
  const callback = absoluteOAuthUrl(platform.publicUrl || new URL(request.url).origin, QQ_OAUTH_CALLBACK_PATH);
  const authorization = new URL("https://graph.qq.com/oauth2.0/authorize");
  authorization.searchParams.set("response_type", "code");
  authorization.searchParams.set("client_id", clientId);
  authorization.searchParams.set("redirect_uri", callback);
  authorization.searchParams.set("state", state);
  authorization.searchParams.set("scope", QQ_OAUTH_SCOPE);
  return Response.redirect(authorization);
}
