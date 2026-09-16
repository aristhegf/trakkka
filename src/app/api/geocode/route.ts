import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { romanisePhase } from "@/lib/geocode-query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface GeocodeHit {
  label: string;
  lat: number;
  lng: number;
}

/**
 * GET /api/geocode?q=<address>
 * Forward geocoding for the Places editor. Signed-in users only, rate-limited per user.
 * Provider: OpenCage when OPENCAGE_API_KEY is set; otherwise Nominatim (OSM) with the required
 * identifying User-Agent, search-on-submit only (their policy forbids autocomplete and heavy use).
 * Results are biased to Nigeria but not restricted to it.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 200);
  if (q.length < 3) return NextResponse.json({ results: [] });

  try {
    const admin = createAdminClient();
    const { data: allowed } = await admin.rpc("rate_limit_take", { p_key: `geocode:${user.id}`, p_limit: 30, p_window_s: 60 });
    if (allowed === false) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  } catch {
    // No service key locally: skip the limiter rather than block the feature.
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const lookup = process.env.OPENCAGE_API_KEY ? opencage : nominatim;
    let results = await lookup(q, ctrl.signal);
    // OSM names Lagos estates with Roman numerals ("Lekki Phase I"); people type "Lekki Phase 1".
    const alt = romanisePhase(q);
    if (results.length === 0 && alt !== q) results = await lookup(alt, ctrl.signal);
    return NextResponse.json({ results });
  } catch (e) {
    return NextResponse.json({ error: "geocoder_unavailable", detail: e instanceof Error ? e.message : String(e) }, { status: 502 });
  } finally {
    clearTimeout(t);
  }
}

async function opencage(q: string, signal: AbortSignal): Promise<GeocodeHit[]> {
  const url = new URL("https://api.opencagedata.com/geocode/v1/json");
  url.searchParams.set("q", q);
  url.searchParams.set("key", process.env.OPENCAGE_API_KEY!);
  url.searchParams.set("limit", "5");
  url.searchParams.set("no_annotations", "1");
  url.searchParams.set("countrycode", "ng");
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`opencage ${res.status}`);
  const json = (await res.json()) as { results?: { formatted: string; geometry: { lat: number; lng: number } }[] };
  return (json.results ?? []).map((r) => ({ label: r.formatted, lat: r.geometry.lat, lng: r.geometry.lng }));
}

async function nominatim(q: string, signal: AbortSignal): Promise<GeocodeHit[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "5");
  url.searchParams.set("addressdetails", "0");
  // Bias (not restrict) results to Nigeria.
  url.searchParams.set("viewbox", "2.6,13.9,14.7,4.2");
  const res = await fetch(url, {
    signal,
    headers: {
      "User-Agent": `Trakkka/0.1 (${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:4127"})`,
      "Accept-Language": "en",
    },
  });
  if (!res.ok) throw new Error(`nominatim ${res.status}`);
  const json = (await res.json()) as { display_name: string; lat: string; lon: string }[];
  return json.map((r) => ({ label: r.display_name, lat: Number(r.lat), lng: Number(r.lon) })).filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
}
