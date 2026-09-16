import { z } from "zod";
import type { ConnectionStatus, ProviderCapabilities, ProviderKey, ProviderKind } from "@/lib/types";

/**
 * The one shape every provider produces. The rest of the system never sees provider payloads.
 * `accuracyM: null` means unknown, and the UI must not draw a small confident dot for it.
 */
export const normalizedLocationSchema = z.object({
  recordedAt: z.string().datetime({ offset: true }),
  latitude: z.number().gte(-90).lte(90),
  longitude: z.number().gte(-180).lte(180),
  accuracyM: z.number().gte(0).lte(50000).nullable().default(null),
  altitudeM: z.number().gte(-500).lte(20000).nullable().default(null),
  speedMps: z.number().gte(0).lte(150).nullable().default(null),
  headingDeg: z.number().gte(0).lte(360).nullable().default(null),
  batteryLevel: z.number().int().gte(0).lte(100).nullable().default(null),
  connectionStatus: z.enum(["online", "offline", "unknown"]).nullable().default(null),
  providerEventId: z.string().max(128).nullable().default(null),
  ignitionOn: z.boolean().nullable().default(null),
  fuelLevelPct: z.number().gte(0).lte(100).nullable().default(null),
  odometerKm: z.number().gte(0).nullable().default(null),
  extra: z.record(z.string(), z.unknown()).nullable().default(null),
});

export type NormalizedLocation = z.infer<typeof normalizedLocationSchema>;

/** A status-only event (no fix): tracker went offline/online, battery report, etc. */
export interface NormalizedStatus {
  at: string;
  connectionStatus: ConnectionStatus;
  batteryLevel?: number | null;
  reason?: string | null;
}

export interface ParseResult {
  locations: NormalizedLocation[];
  statuses: NormalizedStatus[];
}

export interface DeviceContext {
  deviceId: string;
  assetId: string;
  ownerId: string;
  externalDeviceId: string;
  providerKey: ProviderKey;
}

export interface TrackingProvider {
  key: ProviderKey;
  name: string;
  kind: ProviderKind;
  capabilities: ProviderCapabilities;
  /** How the ingest route authenticates a request for this provider. */
  auth: "device_token" | "user_session" | "none";
  /**
   * Where the device token comes from, for apps that cannot send `Authorization: Bearer`.
   * Defaults to the Bearer header. `body` is the parsed JSON or form body merged with query parameters.
   */
  tokenFrom?(req: Request, body: Record<string, unknown>): string | null;
  /** Strip secrets (e.g. a token carried in the body) before a rejected payload is logged. */
  redact?(body: Record<string, unknown>): Record<string, unknown>;
  /**
   * Answer 200 for payloads we cannot use. Phone apps retry any non-2xx from an offline queue, so a 4xx for one
   * bad report would block every later report. The rejection is still logged.
   */
  acknowledgeInvalid?: boolean;
  /** Fixed JSON body for successful responses, when the client expects a specific shape (OwnTracks: []). */
  successBody?: unknown;
  /**
   * Turn a raw request body into normalized records. Throws ZodError / Error on malformed input.
   * A single request may carry many fixes (batch uploads, offline queues).
   */
  parse(body: unknown, ctx: DeviceContext): ParseResult;
}
