import { describe, expect, it } from "vitest";
import { circlePolygon, pointInRing, proximity, ringCentroid, destination } from "@/lib/geo";

const home = { lng: 3.4712, lat: 6.4415 }; // Lekki Phase 1

describe("place proximity", () => {
  const circle = { kind: "circle" as const, center: home, radius_m: 200, geometry: circlePolygon(home, 200) };

  it("reports inside for a point within a circular place's radius", () => {
    const p = destination(home, 150, 30);
    const r = proximity(p, circle);
    expect(r.inside).toBe(true);
    expect(r.distanceM).toBeCloseTo(150, 0);
  });

  it("reports outside and the distance for a point beyond the radius", () => {
    const p = destination(home, 600, 0);
    const r = proximity(p, circle);
    expect(r.inside).toBe(false);
    expect(r.distanceM).toBeCloseTo(600, 0);
  });

  it("uses point-in-polygon for polygon places, not the centre distance", () => {
    // 1 km wide, 100 m tall strip: a point 400 m east of centre is inside, one 400 m north is not.
    const ring = [
      [3.4667, 6.4410],
      [3.4757, 6.4410],
      [3.4757, 6.4419],
      [3.4667, 6.4419],
      [3.4667, 6.4410],
    ];
    const strip = { kind: "polygon" as const, center: null, radius_m: null, geometry: { type: "Polygon" as const, coordinates: [ring] } };
    expect(proximity(destination(home, 400, 90), strip).inside).toBe(true);
    expect(proximity(destination(home, 400, 0), strip).inside).toBe(false);
  });

  it("ring helpers handle closed rings", () => {
    const ring = [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
      [0, 0],
    ];
    expect(ringCentroid(ring)).toEqual({ lng: 1, lat: 1 });
    expect(pointInRing({ lng: 1, lat: 1 }, ring)).toBe(true);
    expect(pointInRing({ lng: 3, lat: 1 }, ring)).toBe(false);
  });
});
