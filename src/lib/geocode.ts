import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { geohashEncode } from "@/lib/geo";

/**
 * Reverse geocoding to a short place label ("Lekki Phase I"), cached by geohash-7 (~150 m cells), so the UI can say
 * where something is in words instead of coordinates.
 *
 * Providers, in order:
 *  - OpenCage, when OPENCAGE_API_KEY is set (terms allow storing results).
 *  - OpenStreetMap Nominatim otherwise: free, ODbL data (attributed on the map), max 1 request per second and results
 *    must be cached, which the geohash cache does. Each asset only triggers a lookup when it enters a new ~150 m cell
 *    or has no label yet, which keeps a personal deployment far below that limit.
 */
export async function reverseGeocodeLabel(lat: number, lng: number, admin: SupabaseClient): Promise<string | null> {
  const gh = geohashEncode(lat, lng, 7);
  const { data: cached } = await admin.from("geocode_cache").select("label").eq("geohash", gh).maybeSingle();
  if (cached?.label) return cached.label;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 3000);
  try {
    const label = process.env.OPENCAGE_API_KEY ? await opencage(lat, lng, ctrl.signal) : await nominatim(lat, lng, ctrl.signal);
    if (label) await admin.from("geocode_cache").upsert({ geohash: gh, label }).then(() => undefined, () => undefined);
    return label;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

type Components = Record<string, string | undefined>;

/** The most useful short name: estate/neighbourhood first, then district, then town. */
function pickLabel(c: Components): string | null {
  return c.neighbourhood || c.suburb || c.quarter || c.residential || c.village || c.hamlet || c.town || c.city_district || c.city || c.county || c.state || null;
}

async function opencage(lat: number, lng: number, signal: AbortSignal): Promise<string | null> {
  const url = new URL("https://api.opencagedata.com/geocode/v1/json");
  url.searchParams.set("q", `${lat.toFixed(6)},${lng.toFixed(6)}`);
  url.searchParams.set("key", process.env.OPENCAGE_API_KEY!);
  url.searchParams.set("no_annotations", "1");
  url.searchParams.set("limit", "1");
  url.searchParams.set("language", "en");
  const res = await fetch(url, { signal });
  if (!res.ok) return null;
  const json = (await res.json()) as { results?: { components?: Components }[] };
  return pickLabel(json.results?.[0]?.components ?? {});
}

async function nominatim(lat: number, lng: number, signal: AbortSignal): Promise<string | null> {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("lat", lat.toFixed(6));
  url.searchParams.set("lon", lng.toFixed(6));
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("zoom", "16");
  url.searchParams.set("addressdetails", "1");
  const res = await fetch(url, {
    signal,
    headers: { "User-Agent": `Trakkka/0.1 (${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:4127"})`, "Accept-Language": "en" },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { address?: Components; error?: string };
  return json.error ? null : pickLabel(json.address ?? {});
}

export async function reverseGeocodeAndStore(admin: SupabaseClient, assetId: string, lat: number, lng: number): Promise<void> {
  const label = await reverseGeocodeLabel(lat, lng, admin);
  if (!label) return;
  await admin.from("asset_states").update({ place_label: label }).eq("asset_id", assetId).eq("place_geohash", geohashEncode(lat, lng, 7));
}
