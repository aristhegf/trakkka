import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { geohashEncode } from "@/lib/geo";

/**
 * Reverse geocoding to a short place label ("Lekki Phase 1"), cached by geohash-7 (~150 m cells).
 * Provider: OpenCage, because its terms allow storing results. (Mapbox temporary geocoding results
 * may not be cached, so it is deliberately not used here.) Without a key the label stays null and
 * the UI shows coordinates, which is honest rather than wrong.
 */
export async function reverseGeocodeLabel(lat: number, lng: number, admin: SupabaseClient): Promise<string | null> {
  const gh = geohashEncode(lat, lng, 7);
  const { data: cached } = await admin.from("geocode_cache").select("label").eq("geohash", gh).maybeSingle();
  if (cached?.label) return cached.label;

  const key = process.env.OPENCAGE_API_KEY;
  if (!key) return null;

  const url = new URL("https://api.opencagedata.com/geocode/v1/json");
  url.searchParams.set("q", `${lat.toFixed(6)},${lng.toFixed(6)}`);
  url.searchParams.set("key", key);
  url.searchParams.set("no_annotations", "1");
  url.searchParams.set("limit", "1");
  url.searchParams.set("language", "en");

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 2500);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      results?: { components?: Record<string, string> }[];
    };
    const c = json.results?.[0]?.components ?? {};
    const label =
      c.neighbourhood || c.suburb || c.quarter || c.village || c.town || c.city_district || c.city || c.county || c.state || null;
    if (label) {
      await admin.from("geocode_cache").upsert({ geohash: gh, label }).then(() => undefined, () => undefined);
    }
    return label;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function reverseGeocodeAndStore(admin: SupabaseClient, assetId: string, lat: number, lng: number): Promise<void> {
  const label = await reverseGeocodeLabel(lat, lng, admin);
  if (!label) return;
  await admin.from("asset_states").update({ place_label: label }).eq("asset_id", assetId).eq("place_geohash", geohashEncode(lat, lng, 7));
}
