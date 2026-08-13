import "server-only";

import { assertSafeUpstream } from "@/lib/server/upstream";

const maxResponseBytes = 64 * 1024;

async function boundedText(response: Response) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxResponseBytes) throw new Error("EPAY_API_RESPONSE_TOO_LARGE");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxResponseBytes) throw new Error("EPAY_API_RESPONSE_TOO_LARGE");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export async function requestEpayApiPayment(input: { url: string; params: Record<string, string>; timeoutMs: number }) {
  const target = await assertSafeUpstream(input.url, "PUBLIC_API");
  const response = await fetch(target, {
    method: "POST",
    redirect: "manual",
    signal: AbortSignal.timeout(input.timeoutMs),
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "User-Agent": "Star-API EPay/1.0",
    },
    body: new URLSearchParams(input.params),
  });
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    if (response.body) await response.body.cancel().catch(() => undefined);
    throw new Error("EPAY_API_REDIRECT_BLOCKED");
  }
  if (!response.ok) {
    if (response.body) await response.body.cancel().catch(() => undefined);
    throw new Error(`EPAY_API_HTTP_${response.status}`);
  }
  const text = await boundedText(response);
  try { return JSON.parse(text) as unknown; }
  catch { throw new Error("EPAY_API_INVALID_RESPONSE"); }
}
