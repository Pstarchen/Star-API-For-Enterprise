import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type { InternalHandlerId } from "@/lib/internal-handlers";

type Input = { body: unknown; query: URLSearchParams };

function bodyObject(body: unknown) {
  return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
}

export function executeInternalHandler(handler: string | null, input: Input) {
  const body = bodyObject(input.body);
  switch (handler as InternalHandlerId) {
    case "time.now": {
      const now = new Date();
      return { status: 200, data: { iso: now.toISOString(), unixMs: now.getTime() } };
    }
    case "utility.uuid":
      return { status: 200, data: { uuid: randomUUID() } };
    case "crypto.sha256": {
      const value = typeof body.value === "string" ? body.value : input.query.get("value");
      if (typeof value !== "string" || !value.length) return { status: 400, data: { code: "INVALID_INPUT", message: "value 必须是非空字符串" } };
      return { status: 200, data: { algorithm: "SHA-256", digest: createHash("sha256").update(value).digest("hex") } };
    }
    case "text.transform": {
      const text = typeof body.text === "string" ? body.text : "";
      const operation = typeof body.operation === "string" ? body.operation : "trim";
      if (!text) return { status: 400, data: { code: "INVALID_INPUT", message: "text 必须是非空字符串" } };
      const transformations: Record<string, () => string | number> = {
        uppercase: () => text.toUpperCase(),
        lowercase: () => text.toLowerCase(),
        trim: () => text.trim(),
        length: () => Array.from(text).length,
      };
      if (!transformations[operation]) return { status: 400, data: { code: "INVALID_OPERATION", message: "operation 仅支持 uppercase、lowercase、trim、length" } };
      return { status: 200, data: { operation, result: transformations[operation]() } };
    }
    default:
      return { status: 503, data: { code: "HANDLER_UNAVAILABLE", message: "内置处理器未配置或不可用" } };
  }
}
