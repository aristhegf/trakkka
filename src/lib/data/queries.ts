import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Alert, AssetOverview, Geofence, TrackingProviderRow } from "@/lib/types";

/** Initial snapshot for the app shell. Everything runs under the user's RLS session. */
export async function loadSnapshot(supabase: SupabaseClient) {
  const [{ data: assets }, { data: alerts }, { data: geofences }, { data: providers }, { data: profile }] = await Promise.all([
    supabase.from("asset_overview").select("*").order("name"),
    supabase.from("alerts").select("*").is("resolved_at", null).order("triggered_at", { ascending: false }).limit(100),
    supabase.rpc("get_geofences_geojson"),
    supabase.from("tracking_providers").select("*").eq("is_active", true),
    supabase.from("profiles").select("id, display_name, timezone, is_admin, home_geofence_id").maybeSingle(),
  ]);
  return {
    assets: (assets ?? []) as AssetOverview[],
    alerts: (alerts ?? []) as Alert[],
    geofences: (geofences ?? []) as Geofence[],
    providers: (providers ?? []) as TrackingProviderRow[],
    profile: profile as { id: string; display_name: string | null; timezone: string; is_admin: boolean; home_geofence_id: string | null } | null,
  };
}

export async function loadAsset(supabase: SupabaseClient, id: string) {
  const [{ data: asset }, { data: pet }, { data: vehicle }, { data: device }, { data: devices }] = await Promise.all([
    supabase.from("asset_overview").select("*").eq("id", id).maybeSingle(),
    supabase.from("pet_profiles").select("*").eq("asset_id", id).maybeSingle(),
    supabase.from("vehicle_profiles").select("*").eq("asset_id", id).maybeSingle(),
    supabase.from("device_profiles").select("*").eq("asset_id", id).maybeSingle(),
    supabase.from("asset_devices").select("id, asset_id, provider_key, external_device_id, tracker_model, status, last_sync_at, last_error, last_error_at, created_at").eq("asset_id", id).order("created_at"),
  ]);
  return { asset: asset as AssetOverview | null, pet, vehicle, device, devices: devices ?? [] };
}

export async function signedPhotoUrl(supabase: SupabaseClient, path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from("asset-photos").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
