import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AuthShell } from "@/components/auth-shell";
import { OAuthCallbackComplete } from "@/components/oauth-callback-complete";
import { safeOAuthNext } from "@/lib/oauth";
import { getCurrentUser } from "@/lib/server/auth";

export const metadata: Metadata = { title: "GitHub 登录完成" };

export default async function OAuthCallbackPage({ searchParams }: PageProps<"/auth/oauth/callback">) {
  await connection();
  const user = await getCurrentUser();
  if (!user) redirect("/login?oauthError=github_invalid_callback");
  const params = await searchParams;
  const fallback = user.platformRole === "ADMIN" ? "/admin" : "/console";
  const nextPath = safeOAuthNext(typeof params.next === "string" ? params.next : null, fallback);
  return <AuthShell title="GitHub 登录成功" description="已验证 GitHub 账号并建立平台会话。"><OAuthCallbackComplete nextPath={nextPath} /></AuthShell>;
}
