import { z } from "zod";
import { normalizedLocationSchema, type ParseResult, type TrackingProvider } from "../types";

/**
 * The "AssetWatch native" payload: already-normalized records.
 * Used by the simulator, the browser geolocation reporter and the future companion apps.
 * Accepts a single record or a batch: { locations: [...], statuses: [...] }.
 */
const statusSchema = z.object({
  at: z.string().datetime({ offset: true }),
  connectionStatus: z.enum(["online", "offline", "unknown"]),
  batteryLevel: z.number().int().gte(0).lte(100).nullable().optional(),
  reason: z.string().max(200).nullable().optional(),
});

const batchSchema = z.object({
  locations: z.array(normalizedLocationSchema).max(500).default([]),
  statuses: z.array(statusSchema).max(50).default([]),
});

export function parseNative(body: unknown): ParseResult {
  if (body && typeof body === "object" && ("locations" in body || "statuses" in body)) {
    const b = batchSchema.parse(body);
    return { locations: b.locations, statuses: b.statuses.map((s) => ({ ...s, batteryLevel: s.batteryLevel ?? null, reason: s.reason ?? null })) };
  }
  return { locations: [normalizedLocationSchema.parse(body)], statuses: [] };
}

export const simulatedProvider: TrackingProvider = {
  key: "simulated",
  name: "Simulated tracker",
  kind: "push_webhook",
  capabilities: { battery: true, speed: true, heading: true, accuracy: true, ignition: true, history: true, connection: true },
  auth: "device_token",
  parse: parseNative,
};

export const iosCompanionProvider: TrackingProvider = {
  key: "ios_companion",
  name: "AssetWatch iOS app",
  kind: "client_reported",
  capabilities: { battery: true, speed: true, heading: true, accuracy: true, history: true },
  auth: "device_token",
  parse: parseNative,
};

/** The signed-in user's browser reporting its own position. Authenticated by the user's session. */
export const browserGeolocationProvider: TrackingProvider = {
  key: "browser_geolocation",
  name: "This browser",
  kind: "client_reported",
  capabilities: { speed: true, heading: true, accuracy: true, history: true },
  auth: "user_session",
  parse: parseNative,
};

/** A manual location entered in the UI. Authenticated by the user's session. */
export const manualProvider: TrackingProvider = {
  key: "manual",
  name: "Manual entry",
  kind: "manual",
  capabilities: { history: true },
  auth: "user_session",
  parse: parseNative,
};

/** Apple devices / AirTags: manual check-in only. There is no Apple location API (see docs/03-integrations.md). */
export const appleFindMyReportedProvider: TrackingProvider = {
  key: "apple_findmy_reported",
  name: "Apple Find My (manual check-in)",
  kind: "manual",
  capabilities: { history: true },
  auth: "user_session",
  parse: parseNative,
};
