import { describe, expect, it } from "vitest";
import { deriveFreshness, ageSeconds, thresholdsFrom } from "@/lib/freshness";

const now = new Date("2026-09-16T12:00:00Z");
const secondsAgo = (s: number) => new Date(now.getTime() - s * 1000).toISOString();

describe("deriveFreshness", () => {
  it("is unknown without a location", () => {
    expect(deriveFreshness(null, "online", undefined, now)).toBe("unknown");
    expect(deriveFreshness(undefined, "online", undefined, now)).toBe("unknown");
  });
  it("is live under the live threshold", () => {
    expect(deriveFreshness(secondsAgo(5), "online", undefined, now)).toBe("live");
    expect(deriveFreshness(secondsAgo(29), "online", undefined, now)).toBe("live");
  });
  it("becomes recent then stale as it ages", () => {
    expect(deriveFreshness(secondsAgo(30), "online", undefined, now)).toBe("recent");
    expect(deriveFreshness(secondsAgo(299), "online", undefined, now)).toBe("recent");
    expect(deriveFreshness(secondsAgo(300), "online", undefined, now)).toBe("stale");
    expect(deriveFreshness(secondsAgo(86400), "online", undefined, now)).toBe("stale");
  });
  it("is offline only when the provider said so, regardless of age", () => {
    expect(deriveFreshness(secondsAgo(2), "offline", undefined, now)).toBe("offline");
    expect(deriveFreshness(secondsAgo(9999), "unknown", undefined, now)).toBe("stale");
  });
  it("never reports live for a provider with liveAfterS = 0 (manual sources)", () => {
    const t = thresholdsFrom({ live_after_s: 0, recent_after_s: 3600, stale_after_s: 86400 });
    expect(deriveFreshness(secondsAgo(0), "unknown", t, now)).toBe("recent");
    expect(deriveFreshness(secondsAgo(3599), "unknown", t, now)).toBe("recent");
    expect(deriveFreshness(secondsAgo(3600), "unknown", t, now)).toBe("stale");
  });
  it("treats future timestamps as age 0", () => {
    expect(ageSeconds(new Date(now.getTime() + 5000), now)).toBe(0);
  });
});
