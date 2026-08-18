export type QqTokenResponse = {
  access_token?: string;
  expires_in?: number | string;
  refresh_token?: string;
  error?: string;
  error_description?: string;
};

export type QqOpenIdResponse = {
  client_id?: string;
  openid?: string;
  unionid?: string;
  error?: number | string;
  error_description?: string;
};

export type QqUserProfile = {
  ret?: number;
  msg?: string;
  nickname?: string;
  figureurl?: string;
  figureurl_1?: string;
  figureurl_2?: string;
  figureurl_qq_1?: string;
  figureurl_qq_2?: string;
};

export function parseQqJson<T>(body: string): T | null {
  const value = body.trim();
  if (!value || value.length > 64 * 1024) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    const opening = value.indexOf("(");
    const closing = value.lastIndexOf(")");
    if (opening <= 0 || closing <= opening) return null;
    try { return JSON.parse(value.slice(opening + 1, closing).trim()) as T; } catch { return null; }
  }
}

export function parseQqTokenResponse(body: string): QqTokenResponse | null {
  const parsed = parseQqJson<QqTokenResponse>(body);
  if (parsed) return parsed;
  const values = new URLSearchParams(body);
  if (!values.size) return null;
  return Object.fromEntries(values.entries()) as QqTokenResponse;
}

export function qqProviderAccountId(clientId: string, openid: string) {
  return `${clientId}:${openid}`;
}
