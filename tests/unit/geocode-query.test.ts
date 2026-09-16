import { describe, expect, it } from "vitest";
import { romanisePhase } from "@/lib/geocode-query";

describe("romanisePhase", () => {
  it("converts Lagos estate phase numbers to the Roman numerals OSM uses", () => {
    expect(romanisePhase("Admiralty Way, Lekki Phase 1")).toBe("Admiralty Way, Lekki Phase I");
    expect(romanisePhase("lekki phase 2")).toBe("lekki phase II");
    expect(romanisePhase("Phase1 estate")).toBe("Phase I estate");
  });
  it("leaves queries without a phase number untouched", () => {
    expect(romanisePhase("Eko Hotel, Victoria Island")).toBe("Eko Hotel, Victoria Island");
    expect(romanisePhase("12 Phase Road")).toBe("12 Phase Road");
    expect(romanisePhase("Phase 12")).toBe("Phase 12");
  });
});
