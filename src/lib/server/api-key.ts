import "server-only";
import { createHash, randomBytes } from "node:crypto";

export type KeyEnvironment = "test" | "live";

export function issueApiKey(environment: KeyEnvironment) {
  const prefix = `sk_${environment}_`;
  const secret = `${prefix}${randomBytes(24).toString("base64url")}`;
  const pepper = process.env.API_KEY_PEPPER;
  if (!pepper && process.env.NODE_ENV === "production") {
    throw new Error("API_KEY_PEPPER is required in production");
  }
  const effectivePepper = pepper ?? "local-development-only";
  const secretHash = createHash("sha256").update(`${secret}:${effectivePepper}`).digest("hex");

  return {
    secret,
    secretHash,
    prefix: secret.slice(0, prefix.length + 8),
  };
}
