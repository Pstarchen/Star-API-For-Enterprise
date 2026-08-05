import "server-only";

export function requestIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const value = forwarded || request.headers.get("x-real-ip") || null;
  return value?.slice(0, 64) ?? null;
}

export const noStoreHeaders = { "Cache-Control": "no-store" } as const;
