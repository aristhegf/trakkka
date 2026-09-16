import { z } from "zod";
import { normalizedLocationSchema, type NormalizedLocation, type NormalizedStatus, type ParseResult, type TrackingProvider } from "../types";

/**
 * Traccar position forwarding (`forward.type=json`) and event forwarding (`event.forward.type=json`).
 * Payloads: { position: {...}, device: {...} } or { event: {...}, position?: {...}, device: {...} }.
 * Units: speed is KNOTS, course is degrees, distances are metres. Accuracy is often 0/absent.
 * Reference: https://www.traccar.org/forward/ and the Traccar OpenAPI Position schema.
 */
const positionSchema = z.object({
  id: z.number().optional(),
  deviceId: z.number().optional(),
  protocol: z.string().optional(),
  serverTime: z.string().optional(),
  deviceTime: z.string().optional(),
  fixTime: z.string().optional(),
  valid: z.boolean().optional(),
  outdated: z.boolean().optional(),
  latitude: z.number(),
  longitude: z.number(),
  altitude: z.number().optional(),
  speed: z.number().optional(),
  course: z.number().optional(),
  accuracy: z.number().optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
});

const eventSchema = z.object({
  id: z.number().optional(),
  type: z.string(),
  eventTime: z.string().optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
});

const forwardSchema = z.object({
  position: positionSchema.optional(),
  event: eventSchema.optional(),
  device: z.object({ id: z.number().optional(), uniqueId: z.string().optional(), name: z.string().optional(), status: z.string().optional() }).optional(),
});

const KNOTS_TO_MPS = 0.514444;

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function bool(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

export function normalizeTraccarPosition(p: z.infer<typeof positionSchema>): NormalizedLocation | null {
  if (p.valid === false) return null;
  const a = p.attributes ?? {};
  const recordedAt = p.fixTime ?? p.deviceTime ?? p.serverTime;
  if (!recordedAt) return null;
  const odometerM = num(a.odometer) ?? num(a.obdOdometer) ?? num(a.totalDistance);
  const batteryLevel = num(a.batteryLevel);
  const extra: Record<string, unknown> = {};
  if (p.protocol) extra.protocol = p.protocol;
  for (const k of ["sat", "hdop", "rssi", "alarm", "power", "battery", "fuel", "adc1", "motion", "event"]) {
    if (a[k] !== undefined) extra[k] = a[k];
  }
  return normalizedLocationSchema.parse({
    recordedAt: new Date(recordedAt).toISOString(),
    latitude: p.latitude,
    longitude: p.longitude,
    // Binary protocols report 0 when accuracy is unknown; 0 would be a lie.
    accuracyM: p.accuracy && p.accuracy > 0 ? p.accuracy : null,
    altitudeM: num(p.altitude),
    speedMps: p.speed != null ? Math.max(0, p.speed * KNOTS_TO_MPS) : null,
    headingDeg: p.course != null ? ((p.course % 360) + 360) % 360 : null,
    batteryLevel: batteryLevel != null ? Math.round(Math.min(100, Math.max(0, batteryLevel))) : null,
    connectionStatus: "online",
    providerEventId: p.id != null ? String(p.id) : null,
    ignitionOn: bool(a.ignition) ?? bool(a.motion),
    fuelLevelPct: num(a.fuelLevel),
    odometerKm: odometerM != null ? odometerM / 1000 : null,
    extra,
  });
}

export const traccarProvider: TrackingProvider = {
  key: "traccar",
  name: "Traccar",
  kind: "push_webhook",
  capabilities: { battery: true, speed: true, heading: true, accuracy: false, ignition: true, history: true, connection: true },
  auth: "device_token",
  parse(body: unknown): ParseResult {
    const b = forwardSchema.parse(body);
    const locations: NormalizedLocation[] = [];
    const statuses: NormalizedStatus[] = [];
    if (b.position) {
      const n = normalizeTraccarPosition(b.position);
      if (n) locations.push(n);
    }
    if (b.event) {
      const at = new Date(b.event.eventTime ?? Date.now()).toISOString();
      switch (b.event.type) {
        case "deviceOffline":
        case "deviceInactive":
          statuses.push({ at, connectionStatus: "offline", reason: b.event.type });
          break;
        case "deviceOnline":
          statuses.push({ at, connectionStatus: "online" });
          break;
        case "alarm": {
          const alarm = String(b.event.attributes?.alarm ?? "");
          if (alarm === "powerCut" || alarm === "lowBattery" || alarm === "lowPower") {
            statuses.push({ at, connectionStatus: "online", reason: `alarm:${alarm}` });
          }
          break;
        }
        default:
          break;
      }
    }
    return { locations, statuses };
  },
};
