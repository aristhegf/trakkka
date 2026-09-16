import { describe, expect, it } from "vitest";
import { traccarProvider, normalizeTraccarPosition } from "@/lib/tracking/providers/traccar";

const ctx = { deviceId: "d", assetId: "a", ownerId: "o", externalDeviceId: "123456789012345", providerKey: "traccar" as const };

const position = {
  id: 9912,
  deviceId: 10,
  protocol: "teltonika",
  serverTime: "2026-09-16T10:00:03.000+00:00",
  deviceTime: "2026-09-16T10:00:00.000+00:00",
  fixTime: "2026-09-16T10:00:00.000+00:00",
  valid: true,
  latitude: 6.4474,
  longitude: 3.4219,
  altitude: 12,
  speed: 21.6, // knots
  course: 270,
  accuracy: 0, // binary protocols report 0 when unknown
  attributes: { ignition: true, sat: 13, hdop: 0.8, power: 14.381, battery: 3.954, batteryLevel: 95, odometer: 5460919, fuelLevel: 40 },
};

describe("Traccar adapter", () => {
  it("converts knots to m/s, metres to km and drops a zero accuracy", () => {
    const n = normalizeTraccarPosition(position)!;
    expect(n.speedMps).toBeCloseTo(11.11, 1);
    expect(n.odometerKm).toBeCloseTo(5460.919, 3);
    expect(n.accuracyM).toBeNull();
    expect(n.headingDeg).toBe(270);
    expect(n.batteryLevel).toBe(95);
    expect(n.ignitionOn).toBe(true);
    expect(n.fuelLevelPct).toBe(40);
    expect(n.providerEventId).toBe("9912");
    expect(n.recordedAt).toBe("2026-09-16T10:00:00.000Z");
    expect(n.extra).toMatchObject({ protocol: "teltonika", sat: 13, hdop: 0.8 });
  });
  it("drops invalid fixes and maps offline events to statuses", () => {
    const r = traccarProvider.parse({ position: { ...position, valid: false }, event: { type: "deviceOffline", eventTime: "2026-09-16T10:05:00Z" }, device: { uniqueId: "1" } }, ctx);
    expect(r.locations).toHaveLength(0);
    expect(r.statuses).toEqual([{ at: "2026-09-16T10:05:00.000Z", connectionStatus: "offline", reason: "deviceOffline" }]);
  });
  it("falls back to motion when ignition is absent", () => {
    const n = normalizeTraccarPosition({ ...position, attributes: { motion: false } })!;
    expect(n.ignitionOn).toBe(false);
    expect(n.batteryLevel).toBeNull();
  });
  it("rejects malformed payloads", () => {
    expect(() => traccarProvider.parse({ position: { latitude: "x" } }, ctx)).toThrow();
  });
});
