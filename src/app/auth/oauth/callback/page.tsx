import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AuthShell } from "@/components/auth-shell";
import { OAuthCallbackComplete } from "@/components/oauth-callback-complete";
import { OAUTH_PROVIDER_LABELS, safeOAuthNext, type OAuthProvider } from "@/lib/oauth";
import { getCurrentUser } from "@/lib/server/auth";

export const metadata: Metadata = { title: "第三方登录完成" };

export default async function OAuthCallbackPage({ searchParams }: PageProps<"/auth/oauth/callback">) {
  await connection();
  const params = await searchParams;
  const provider: OAuthProvider = params.provider === "qq" ? "qq" : "github";
  const user = await getCurrentUser();
  if (!user) redirect(`/login?oauthError=${provider}_invalid_callback`);
  const fallback = user.platformRole === "ADMIN" ? "/admin" : "/console";
  const nextPath = safeOAuthNext(typeof params.next === "string" ? params.next : null, fallback);
  return <AuthShell title={`${OAUTH_PROVIDER_LABELS[provider]} 登录成功`} description={`已验证 ${OAUTH_PROVIDER_LABELS[provider]} 账号并建立平台会话。`}><OAuthCallbackComplete provider={provider} nextPath={nextPath} /></AuthShell>;
}
