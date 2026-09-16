import { describe, expect, it } from "vitest";
import { generateDeviceToken, hashToken, looksLikeDeviceToken } from "@/lib/tracking/tokens";

describe("device tokens", () => {
  it("generates unique prefixed tokens whose hash is stable", () => {
    const a = generateDeviceToken();
    const b = generateDeviceToken();
    expect(a.token).not.toBe(b.token);
    expect(a.token.startsWith("awd_")).toBe(true);
    expect(a.hash).toBe(hashToken(a.token));
    expect(a.hash).toHaveLength(64);
    expect(looksLikeDeviceToken(a.token)).toBe(true);
    expect(looksLikeDeviceToken("Bearer nope")).toBe(false);
  });
});
