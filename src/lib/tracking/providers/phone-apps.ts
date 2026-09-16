import { normalizedLocationSchema, type NormalizedLocation, type ParseResult, type TrackingProvider } from "../types";

/**
 * Free, open-source phone tracker apps that post straight to Trakkka. No Apple/Google developer account needed:
 * the user installs the app from the store and pastes in the URL and their device token.
 *
 * Both apps retry any non-2xx response from an offline queue, so a report we cannot use (no GPS fix, bad value)
 * is acknowledged with 200 and logged, never answered with 4xx, or it would jam the phone's queue forever.
 */

type Fields = Record<string, unknown>;

function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
/** Platform APIs report -1 for "unknown" speed, heading and accuracy. */
function nonNegative(v: unknown): number | null {
  const n = num(v);
  return n != null && n >= 0 ? n : null;
}
function epochToIso(v: unknown): string | null {
  const n = num(v);
  if (n == null || n <= 0) return null;
  const ms = n > 1e12 ? n : n * 1000; // seconds or milliseconds
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
function clampPct(v: unknown): number | null {
  const n = num(v);
  if (n == null || n < 0) return null;
  return Math.round(Math.min(100, n));
}

// ------------------------------------------------------------------ Traccar Client
/**
 * Traccar Client 10.x (traccar_client_sdk HttpUploader): form-encoded POST to the server URL exactly as typed, with
 * id, lat, lon, timestamp (epoch s), accuracy, altitude, speed (KNOTS), bearing, batt (0-100), charge, alarm.
 * Older versions sent the same OsmAnd keys as query parameters. The app cannot send headers, so the Trakkka device
 * token goes in the app's "Device identifier" field and arrives as `id`.
 */
export function parseTraccarClient(body: Fields): ParseResult {
  const lat = num(body.lat);
  const lon = num(body.lon);
  const recordedAt = epochToIso(body.timestamp);
  if (lat == null || lon == null || recordedAt == null) return { locations: [], statuses: [] };
  const speedKnots = nonNegative(body.speed);
  const extra: Record<string, unknown> = { app: "traccar_client" };
  if (body.charge != null) extra.charging = String(body.charge) === "true";
  if (typeof body.alarm === "string") extra.alarm = body.alarm.slice(0, 40);
  const loc: NormalizedLocation = normalizedLocationSchema.parse({
    recordedAt,
    latitude: lat,
    longitude: lon,
    accuracyM: nonNegative(body.accuracy),
    altitudeM: num(body.altitude),
    speedMps: speedKnots != null ? Math.round(speedKnots * 0.514444 * 100) / 100 : null,
    headingDeg: nonNegative(body.bearing ?? body.heading),
    batteryLevel: clampPct(body.batt),
    providerEventId: null, // the app has no event id; same-timestamp duplicates are caught in the database
    extra,
  });
  return { locations: [loc], statuses: [] };
}

export const traccarClientProvider: TrackingProvider = {
  key: "traccar_client",
  name: "Traccar Client app",
  kind: "client_reported",
  capabilities: { battery: true, speed: true, heading: true, accuracy: true, history: true },
  auth: "device_token",
  tokenFrom: (_req, body) => (typeof body.id === "string" ? body.id : typeof body.deviceid === "string" ? body.deviceid : null),
  redact: (body) => ({ ...body, id: body.id ? "[redacted]" : undefined, deviceid: body.deviceid ? "[redacted]" : undefined }),
  acknowledgeInvalid: true,
  parse: (body) => parseTraccarClient(body as Fields),
};

// ------------------------------------------------------------------ OwnTracks
/**
 * OwnTracks HTTP mode: POST application/json, HTTP Basic auth, one message per request. Only `_type: "location"`
 * carries a position: lat, lon, tst (epoch s), acc (m), alt (m), vel (KM/H), cog (deg), batt (%), bs (2/3 = charging).
 * Other message types (transition, waypoint, lwt, status) are acknowledged and ignored. The server must answer 2xx,
 * typically with an empty JSON array. The Trakkka device token is the Basic auth password.
 */
export function parseOwnTracks(body: Fields): ParseResult {
  if (body._type !== "location") return { locations: [], statuses: [] };
  const lat = num(body.lat);
  const lon = num(body.lon);
  const recordedAt = epochToIso(body.tst);
  if (lat == null || lon == null || recordedAt == null) return { locations: [], statuses: [] };
  const velKmh = nonNegative(body.vel);
  const extra: Record<string, unknown> = { app: "owntracks" };
  if (typeof body.t === "string") extra.trigger = body.t.slice(0, 2);
  if (typeof body.conn === "string") extra.conn = body.conn.slice(0, 2);
  const bs = num(body.bs);
  if (bs != null) extra.charging = bs === 2 || bs === 3;
  const loc: NormalizedLocation = normalizedLocationSchema.parse({
    recordedAt,
    latitude: lat,
    longitude: lon,
    accuracyM: nonNegative(body.acc),
    altitudeM: num(body.alt),
    speedMps: velKmh != null ? Math.round((velKmh / 3.6) * 100) / 100 : null,
    headingDeg: nonNegative(body.cog),
    batteryLevel: clampPct(body.batt),
    providerEventId: null,
    extra,
  });
  return { locations: [loc], statuses: [] };
}

function basicAuthPassword(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  if (!h.startsWith("Basic ")) return null;
  try {
    const decoded = Buffer.from(h.slice(6).trim(), "base64").toString("utf8");
    const i = decoded.indexOf(":");
    return i >= 0 ? decoded.slice(i + 1) : null;
  } catch {
    return null;
  }
}

export const ownTracksProvider: TrackingProvider = {
  key: "owntracks",
  name: "OwnTracks app",
  kind: "client_reported",
  capabilities: { battery: true, speed: true, heading: true, accuracy: true, history: true },
  auth: "device_token",
  tokenFrom: (req) => basicAuthPassword(req),
  acknowledgeInvalid: true,
  successBody: [],
  parse: (body) => parseOwnTracks(body as Fields),
};
