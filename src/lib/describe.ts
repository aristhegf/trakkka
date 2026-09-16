/**
 * Plain-language descriptions of an asset's state. The UI shows these instead of raw coordinates, codes and dots,
 * so a glance answers: where is it, is it moving, how old is that, can I trust it.
 */
import type { AssetOverview, Freshness, Geofence } from "./types";
import { proximity } from "./geo";
import { formatDistance, formatSpeedKph, relativeTime } from "./format";

export const FRESHNESS_HELP: Record<Freshness, string> = {
  live: "Reported moments ago. This is where it is now.",
  recent: "Reported a few minutes ago. Probably still close to here.",
  stale: "No report for a while. This is the last place it was seen.",
  offline: "The tracker says it is offline. Showing the last known place.",
  unknown: "No location has been received yet.",
};

export interface Where {
  /** "At Home", "Lekki Phase I", "1.2 km from Office", or coordinates as a last resort. */
  title: string;
  /** Extra context under the title, e.g. the neighbourhood when title is a Place. */
  detail: string | null;
  hasLocation: boolean;
}

const NEAR_PLACE_M = 3000;

export function describeWhere(asset: Pick<AssetOverview, "latitude" | "longitude" | "place_label">, places: Geofence[] = []): Where {
  if (asset.latitude == null || asset.longitude == null) return { title: "No location yet", detail: null, hasLocation: false };
  const point = { lat: asset.latitude, lng: asset.longitude };
  const ranked = places
    .filter((p) => p.is_active)
    .map((p) => ({ p, ...proximity(point, p) }))
    .sort((a, b) => a.distanceM - b.distanceM);
  const inside = ranked.find((r) => r.inside);
  if (inside) return { title: `At ${inside.p.name}`, detail: asset.place_label, hasLocation: true };
  if (asset.place_label) {
    const near = ranked[0] && ranked[0].distanceM <= NEAR_PLACE_M ? `${formatDistance(ranked[0].distanceM)} from ${ranked[0].p.name}` : null;
    return { title: asset.place_label, detail: near, hasLocation: true };
  }
  if (ranked[0] && ranked[0].distanceM <= NEAR_PLACE_M) {
    return { title: `${formatDistance(ranked[0].distanceM)} from ${ranked[0].p.name}`, detail: coordinates(point.lat, point.lng), hasLocation: true };
  }
  return { title: "Unnamed area", detail: coordinates(point.lat, point.lng), hasLocation: true };
}

export function coordinates(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

/** "Moving · 42 km/h", "Still", or null when movement cannot be known (old or no data). */
export function describeMovement(asset: Pick<AssetOverview, "movement_state" | "speed_mps" | "type">, freshness: Freshness): string | null {
  if (freshness === "unknown") return null;
  if (freshness === "stale" || freshness === "offline") return asset.movement_state === "moving" ? "Was moving" : "Was still";
  if (asset.movement_state === "moving") {
    const verb = asset.type === "vehicle" ? "Driving" : "Moving";
    return asset.speed_mps != null && asset.speed_mps > 0.8 ? `${verb} · ${formatSpeedKph(asset.speed_mps)}` : verb;
  }
  if (asset.movement_state === "stationary") return asset.type === "vehicle" ? "Parked" : "Still";
  return null;
}

/** How much to trust the dot on the map. */
export function describeAccuracy(m: number | null | undefined): string | null {
  if (m == null) return null;
  if (m <= 25) return `Precise, within ${Math.round(m)} m`;
  if (m <= 150) return `Close, within ${Math.round(m)} m`;
  return `Approximate, within ${formatDistance(m)}`;
}

/** One short line for lists: "At Home · 2 min ago". */
export function describeSummary(asset: AssetOverview, places: Geofence[], now: Date): string {
  const where = describeWhere(asset, places);
  if (!where.hasLocation) return "Waiting for its first location";
  return `${where.title} · ${relativeTime(asset.last_location_at, now)}`;
}

export function directionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(6)},${lng.toFixed(6)}`;
}
