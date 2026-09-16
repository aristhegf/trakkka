import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DeviceContext, NormalizedLocation, NormalizedStatus } from "@/lib/tracking/types";
import { reverseGeocodeAndStore } from "@/lib/geocode";

export interface IngestOutcome {
  status: "accepted" | "sampled" | "duplicate" | "out_of_order" | "rejected" | "error";
  reason?: string;
  location_id?: number | null;
  asset_id?: string;
}

interface RpcResult {
  status: IngestOutcome["status"];
  reason?: string;
  location_id?: number | null;
  asset_id?: string;
  owner_id?: string;
  place_changed?: boolean;
  latitude?: number;
  longitude?: number;
}

/**
 * Pushes normalized records through the database ingest function (the single write path).
 * Reverse geocoding runs after a successful state change and never blocks the response.
 */
export async function ingestRecords(
  ctx: DeviceContext,
  locations: NormalizedLocation[],
  statuses: NormalizedStatus[],
  meta: { ip: string | null; userAgent: string | null },
  admin: SupabaseClient = createAdminClient(),
): Promise<IngestOutcome[]> {
  const outcomes: IngestOutcome[] = [];
  // Providers may batch out-of-order; feed oldest first so the newest ends up as current state.
  const sorted = [...locations].sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt));
  const geocodeTargets: { lat: number; lng: number }[] = [];

  for (const loc of sorted) {
    const { data, error } = await admin.rpc("ingest_location", {
      p_device_id: ctx.deviceId,
      p_recorded_at: loc.recordedAt,
      p_latitude: loc.latitude,
      p_longitude: loc.longitude,
      p_accuracy_m: loc.accuracyM,
      p_altitude_m: loc.altitudeM,
      p_speed_mps: loc.speedMps,
      p_heading_deg: loc.headingDeg,
      p_battery_level: loc.batteryLevel,
      p_source: ctx.providerKey,
      p_provider_event_id: loc.providerEventId,
      p_connection_status: loc.connectionStatus,
      p_ignition_on: loc.ignitionOn,
      p_fuel_level_pct: loc.fuelLevelPct,
      p_odometer_km: loc.odometerKm,
      p_extra: loc.extra,
      p_request_ip: meta.ip,
      p_user_agent: meta.userAgent,
    });
    if (error) {
      outcomes.push({ status: "error", reason: error.message });
      continue;
    }
    const r = data as RpcResult;
    outcomes.push({ status: r.status, reason: r.reason, location_id: r.location_id, asset_id: r.asset_id });
    if ((r.status === "accepted" || r.status === "sampled") && r.place_changed && r.latitude != null && r.longitude != null) {
      geocodeTargets.push({ lat: r.latitude, lng: r.longitude });
    }
  }

  for (const st of statuses) {
    const { data, error } = await admin.rpc("ingest_device_status", {
      p_device_id: ctx.deviceId,
      p_connection_status: st.connectionStatus,
      p_battery_level: st.batteryLevel ?? null,
      p_at: st.at,
      p_reason: st.reason ?? null,
    });
    if (error) outcomes.push({ status: "error", reason: error.message });
    else outcomes.push({ status: (data as RpcResult).status, reason: (data as RpcResult).reason });
  }

  // Only the latest place matters; geocode once per request.
  const last = geocodeTargets.at(-1);
  if (last) {
    await reverseGeocodeAndStore(admin, ctx.assetId, last.lat, last.lng).catch(() => undefined);
  }
  return outcomes;
}

/** Records a rejection that happened before the database function could run (auth, parse). */
export async function logRejectedIngest(
  admin: SupabaseClient,
  fields: {
    providerKey: string | null;
    deviceId?: string | null;
    ownerId?: string | null;
    externalDeviceId?: string | null;
    reason: string;
    payload?: unknown;
    ip: string | null;
    userAgent: string | null;
  },
): Promise<void> {
  let payload: unknown = fields.payload ?? null;
  const text = payload == null ? "" : JSON.stringify(payload);
  if (text.length > 6000) payload = { truncated: true, preview: text.slice(0, 5000) };
  await admin
    .from("ingest_events")
    .insert({
      provider_key: fields.providerKey,
      device_id: fields.deviceId ?? null,
      owner_id: fields.ownerId ?? null,
      external_device_id: fields.externalDeviceId ?? null,
      status: "rejected",
      reason: fields.reason,
      payload,
      request_ip: fields.ip,
      user_agent: fields.userAgent,
    })
    .then(() => undefined, () => undefined);
}

export function requestMeta(req: Request): { ip: string | null; userAgent: string | null } {
  const fwd = req.headers.get("x-forwarded-for");
  const ip = (fwd ? fwd.split(",")[0].trim() : req.headers.get("x-real-ip")) || null;
  const ua = req.headers.get("user-agent");
  return { ip: ip && /^[0-9a-fA-F.:]+$/.test(ip) ? ip : null, userAgent: ua ? ua.slice(0, 300) : null };
}
