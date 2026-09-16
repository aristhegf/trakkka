import { createHash, randomBytes } from "node:crypto";

const PREFIX = "awd_";

/** Generates a device ingest token. Only the SHA-256 is stored; the token is shown once. */
export function generateDeviceToken(): { token: string; hash: string } {
  const token = PREFIX + randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function looksLikeDeviceToken(token: string): boolean {
  return token.startsWith(PREFIX) && token.length > 20 && token.length < 100;
}
