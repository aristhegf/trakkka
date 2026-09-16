import { describe, expect, it } from "vitest";
import { haversineM, bearingDeg, destination, circlePolygon, geohashEncode, isValidLatLng, bbox } from "@/lib/geo";

describe("geo helpers", () => {
  it("measures Lekki to Ikoyi at roughly 4.4 km", () => {
    const d = haversineM({ lng: 3.4712, lat: 6.4415 }, { lng: 3.434, lat: 6.453 });
    expect(d).toBeGreaterThan(4000);
    expect(d).toBeLessThan(4800);
  });
  it("destination inverts haversine", () => {
    const o = { lng: 3.42, lat: 6.45 };
    const p = destination(o, 1000, 45);
    expect(haversineM(o, p)).toBeCloseTo(1000, 0);
    expect(bearingDeg(o, p)).toBeCloseTo(45, 0);
  });
  it("builds a closed circle polygon", () => {
    const poly = circlePolygon({ lng: 3.42, lat: 6.45 }, 100, 16);
    const ring = poly.coordinates[0];
    expect(ring).toHaveLength(17);
    expect(ring[0]).toEqual(ring[16]);
  });
  it("geohash matches the reference encoding", () => {
    // Reference: geohash.org / Wikipedia example: 42.605, -5.603 => "ezs42"
    expect(geohashEncode(42.605, -5.603, 5)).toBe("ezs42");
    // Lagos falls in the "s14" cell; precision 7 cells are ~150 m
    expect(geohashEncode(6.4474, 3.4219, 7).startsWith("s14")).toBe(true);
    expect(geohashEncode(6.4474, 3.4219, 7)).toHaveLength(7);
  });
  it("rejects null island and out-of-range coordinates", () => {
    expect(isValidLatLng(0, 0)).toBe(false);
    expect(isValidLatLng(0.00001, 0.00001)).toBe(false);
    expect(isValidLatLng(91, 0)).toBe(false);
    expect(isValidLatLng(6.45, 3.42)).toBe(true);
    expect(isValidLatLng(NaN, 3)).toBe(false);
  });
  it("bbox handles empty and multi-point input", () => {
    expect(bbox([])).toBeNull();
    expect(bbox([{ lng: 1, lat: 2 }, { lng: -1, lat: 5 }])).toEqual([[-1, 2], [1, 5]]);
  });
});
