import "server-only";

export function requestIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const value = forwarded || request.headers.get("x-real-ip") || null;
  return value?.slice(0, 64) ?? null;
}

function limitedBody(request: Request, maximumBytes: number) {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0) throw new Error("INVALID_REQUEST_BODY_LIMIT");
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && /^\d+$/.test(declaredLength) && BigInt(declaredLength) > BigInt(maximumBytes)) throw new Error("REQUEST_BODY_TOO_LARGE");
  if (!request.body) return null;
  let receivedBytes = 0;
  return request.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      receivedBytes += chunk.byteLength;
      if (receivedBytes > maximumBytes) {
        controller.error(new Error("REQUEST_BODY_TOO_LARGE"));
        return;
      }
      controller.enqueue(chunk);
    },
  }));
}

function limitedBodyResponse(request: Request, maximumBytes: number) {
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);
  return new Response(limitedBody(request, maximumBytes), { headers });
}

export function readLimitedFormData(request: Request, maximumBytes: number) {
  return limitedBodyResponse(request, maximumBytes).formData();
}

export function readLimitedJson(request: Request, maximumBytes: number) {
  return limitedBodyResponse(request, maximumBytes).json() as Promise<unknown>;
}

export function readLimitedText(request: Request, maximumBytes: number) {
  return limitedBodyResponse(request, maximumBytes).text();
}

export function isRequestBodyTooLarge(error: unknown) {
  return error instanceof Error && error.message === "REQUEST_BODY_TOO_LARGE";
}

export const noStoreHeaders = { "Cache-Control": "no-store" } as const;
