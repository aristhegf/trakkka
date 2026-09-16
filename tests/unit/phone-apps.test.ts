import { describe, expect, it } from "vitest";
import { ownTracksProvider, parseOwnTracks, parseTraccarClient, traccarClientProvider } from "@/lib/tracking/providers/phone-apps";

describe("Traccar Client (form fields from traccar_client_sdk HttpUploader)", () => {
  // Exactly what the SDK submits: every value is a string in a form body.
  const form = { id: "awd_secret-token-value-123456", lat: "6.4415", lon: "3.4712", timestamp: "1789574400", accuracy: "12.5", altitude: "8.0", speed: "9.72", bearing: "270.0", batt: "74", charge: "false" };

  it("converts knots to m/s, epoch seconds to ISO and keeps battery as a percentage", () => {
    const { locations } = parseTraccarClient(form);
    expect(locations).toHaveLength(1);
    const l = locations[0];
    expect(l.recordedAt).toBe(new Date(1789574400 * 1000).toISOString());
    expect(l.latitude).toBe(6.4415);
    expect(l.speedMps).toBeCloseTo(5.0, 1);
    expect(l.headingDeg).toBe(270);
    expect(l.accuracyM).toBe(12.5);
    expect(l.batteryLevel).toBe(74);
    expect(l.extra).toMatchObject({ app: "traccar_client", charging: false });
  });

  it("treats -1 speed/bearing/accuracy (platform 'unknown') as null instead of failing", () => {
    const { locations } = parseTraccarClient({ ...form, speed: "-1.94", bearing: "-1", accuracy: "-1" });
    expect(locations[0].speedMps).toBeNull();
    expect(locations[0].headingDeg).toBeNull();
    expect(locations[0].accuracyM).toBeNull();
  });

  it("skips reports without a fix rather than throwing", () => {
    expect(parseTraccarClient({ id: "x", timestamp: "1789574400", batt: "50" }).locations).toHaveLength(0);
  });

  it("reads the token from id and redacts it before logging", () => {
    const req = new Request("https://x/api/ingest/traccar_client", { method: "POST" });
    expect(traccarClientProvider.tokenFrom!(req, form)).toBe(form.id);
    expect(traccarClientProvider.redact!(form).id).toBe("[redacted]");
    expect(traccarClientProvider.acknowledgeInvalid).toBe(true);
  });
});

describe("OwnTracks HTTP mode", () => {
  const msg = { _type: "location", lat: 6.4474, lon: 3.4219, tst: 1789574400, acc: 15, alt: 12, vel: 36, cog: 90, batt: 61, bs: 2, t: "u", conn: "m", tid: "ph" };

  it("converts km/h to m/s and maps battery state", () => {
    const l = parseOwnTracks(msg).locations[0];
    expect(l.speedMps).toBe(10);
    expect(l.batteryLevel).toBe(61);
    expect(l.accuracyM).toBe(15);
    expect(l.extra).toMatchObject({ app: "owntracks", charging: true, trigger: "u", conn: "m" });
  });

  it("ignores non-location messages", () => {
    expect(parseOwnTracks({ _type: "transition", event: "enter" }).locations).toHaveLength(0);
    expect(parseOwnTracks({ _type: "lwt", tst: 1 }).locations).toHaveLength(0);
  });

  it("takes the token from the Basic auth password and answers with an empty array", () => {
    const creds = Buffer.from("trakkka:awd_owntracks-token-abcdef").toString("base64");
    const req = new Request("https://x/api/ingest/owntracks", { method: "POST", headers: { Authorization: `Basic ${creds}` } });
    expect(ownTracksProvider.tokenFrom!(req, {})).toBe("awd_owntracks-token-abcdef");
    expect(ownTracksProvider.tokenFrom!(new Request("https://x"), {})).toBeNull();
    expect(ownTracksProvider.successBody).toEqual([]);
  });
});
