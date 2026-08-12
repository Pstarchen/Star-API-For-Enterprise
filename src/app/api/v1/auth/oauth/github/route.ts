import { createHash, randomBytes } from "node:crypto";
import { absoluteOAuthUrl, GITHUB_OAUTH_CALLBACK_PATH, GITHUB_OAUTH_SCOPES, safeOAuthNext } from "@/lib/oauth";
import { getIntegration } from "@/lib/server/integrations";
import { getPlatformConfig } from "@/lib/server/installation";
import { prisma } from "@/lib/server/prisma";

function stateHash(value: string) { return createHash("sha256").update(value).digest("hex"); }

export async function GET(request: Request) {
  const github = await getIntegration("github");
  const clientId = typeof github.publicConfig.clientId === "string" ? github.publicConfig.clientId.trim() : "";
  if (!github.enabled || !github.configured || !clientId) return Response.redirect(new URL("/login?oauthError=github_not_configured", request.url));

  const state = randomBytes(32).toString("base64url");
  await prisma.$transaction([
    prisma.oAuthState.deleteMany({ where: { expiresAt: { lte: new Date() } } }),
    prisma.oAuthState.create({ data: { provider: "github", tokenHash: stateHash(state), redirectPath: safeOAuthNext(new URL(request.url).searchParams.get("next")), expiresAt: new Date(Date.now() + 10 * 60 * 1000) } }),
  ]);

  const platform = await getPlatformConfig();
  const callback = absoluteOAuthUrl(platform.publicUrl || new URL(request.url).origin, GITHUB_OAUTH_CALLBACK_PATH);
  const authorization = new URL("https://github.com/login/oauth/authorize");
  authorization.searchParams.set("client_id", clientId);
  authorization.searchParams.set("redirect_uri", callback);
  authorization.searchParams.set("scope", GITHUB_OAUTH_SCOPES.join(" "));
  authorization.searchParams.set("state", state);
  return Response.redirect(authorization);
}
