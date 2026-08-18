export const GITHUB_OAUTH_START_PATH = "/api/v1/auth/oauth/github";
export const GITHUB_OAUTH_CALLBACK_PATH = "/api/v1/auth/oauth/github/callback";
export const QQ_OAUTH_START_PATH = "/api/v1/auth/oauth/qq";
export const QQ_OAUTH_CALLBACK_PATH = "/api/v1/auth/oauth/qq/callback";
export const OAUTH_FRONTEND_CALLBACK_PATH = "/auth/oauth/callback";
export const GITHUB_OAUTH_SCOPES = ["read:user", "user:email"] as const;
export const QQ_OAUTH_SCOPE = "get_user_info";

export type OAuthProvider = "github" | "qq";

export const OAUTH_PROVIDER_LABELS: Record<OAuthProvider, string> = {
  github: "GitHub",
  qq: "QQ",
};

export function safeOAuthNext(value: string | null | undefined, fallback = "/console") {
  return value?.startsWith("/") && !value.startsWith("//") ? value : fallback;
}

export function absoluteOAuthUrl(publicUrl: string, path: string) {
  const base = new URL(publicUrl);
  if (base.protocol !== "http:" && base.protocol !== "https:") throw new Error("OAuth public URL must use HTTP or HTTPS");
  return new URL(path, base.origin).toString();
}
