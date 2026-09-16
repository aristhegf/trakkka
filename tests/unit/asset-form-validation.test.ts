import { describe, expect, it } from "vitest";
import { z } from "zod";

// Mirrors the optStr helper in src/lib/assets/actions.ts (a "use server" module cannot be imported in unit tests).
const optStr = (max: number) =>
  z.preprocess((v) => (v == null || (typeof v === "string" && v.trim() === "") ? null : v), z.string().trim().max(max).nullable());

describe("optional form fields", () => {
  const schema = z.object({ external_device_id: optStr(120), tracker_model: optStr(80) });

  it("accepts fields the form did not render (phone, manual and browser sources hide them)", () => {
    expect(schema.parse({})).toEqual({ external_device_id: null, tracker_model: null });
  });
  it("treats blank as not provided and keeps real values", () => {
    expect(schema.parse({ external_device_id: "  ", tracker_model: "Teltonika FMC920" })).toEqual({ external_device_id: null, tracker_model: "Teltonika FMC920" });
  });
});
