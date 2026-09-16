import { describe, expect, it } from "vitest";
import { parseNative } from "@/lib/tracking/providers/generic";

const good = { recordedAt: "2026-09-16T10:00:00Z", latitude: 6.45, longitude: 3.42, accuracyM: 8, speedMps: 3.2, batteryLevel: 74 };

describe("native payload parsing", () => {
  it("accepts a single record and fills defaults", () => {
    const r = parseNative(good);
    expect(r.locations).toHaveLength(1);
    expect(r.locations[0].headingDeg).toBeNull();
    expect(r.locations[0].connectionStatus).toBeNull();
    expect(r.statuses).toHaveLength(0);
  });
  it("accepts a batch with statuses", () => {
    const r = parseNative({ locations: [good, { ...good, recordedAt: "2026-09-16T10:00:05Z" }], statuses: [{ at: "2026-09-16T10:00:06Z", connectionStatus: "offline", reason: "power cut" }] });
    expect(r.locations).toHaveLength(2);
    expect(r.statuses[0].connectionStatus).toBe("offline");
  });
  it("rejects out-of-range coordinates, speed and battery", () => {
    expect(() => parseNative({ ...good, latitude: 91 })).toThrow();
    expect(() => parseNative({ ...good, longitude: -181 })).toThrow();
    expect(() => parseNative({ ...good, speedMps: 200 })).toThrow();
    expect(() => parseNative({ ...good, batteryLevel: 101 })).toThrow();
    expect(() => parseNative({ ...good, recordedAt: "yesterday" })).toThrow();
  });
  it("caps batch size", () => {
    expect(() => parseNative({ locations: Array.from({ length: 501 }, () => good) })).toThrow();
  });
});
