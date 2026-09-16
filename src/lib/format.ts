export function relativeTime(at: string | Date | null | undefined, now: Date = new Date()): string {
  if (!at) return "never";
  const t = typeof at === "string" ? Date.parse(at) : at.getTime();
  const s = Math.max(0, Math.round((now.getTime() - t) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s} s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} d ago`;
  return new Date(t).toLocaleDateString();
}

export function formatSpeedKph(mps: number | null | undefined): string {
  if (mps == null) return "—";
  return `${Math.round(mps * 3.6)} km/h`;
}

export function formatDistance(m: number | null | undefined): string {
  if (m == null) return "—";
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 2 : 1)} km`;
}

export function formatDuration(s: number | null | undefined): string {
  if (s == null) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h === 0) return `${m} min`;
  return `${h} h ${m} min`;
}

export function formatAccuracy(m: number | null | undefined): string {
  if (m == null) return "unknown accuracy";
  if (m < 1000) return `±${Math.round(m)} m`;
  return `±${(m / 1000).toFixed(1)} km`;
}

/**
 * Locale and timezone are pinned so the server render and the client hydration produce identical
 * text (Vercel renders in UTC with a different default locale than a browser in Lagos).
 * `tz` comes from the user's profile (default Africa/Lagos).
 */
const LOCALE = "en-GB";
export const DEFAULT_TZ = "Africa/Lagos";

export function formatDateTime(at: string | Date | null | undefined, tz: string = DEFAULT_TZ): string {
  if (!at) return "—";
  const d = typeof at === "string" ? new Date(at) : at;
  return d.toLocaleString(LOCALE, {
    timeZone: tz,
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTime(at: string | Date, tz: string = DEFAULT_TZ): string {
  const d = typeof at === "string" ? new Date(at) : at;
  return d.toLocaleTimeString(LOCALE, { timeZone: tz, hour: "2-digit", minute: "2-digit" });
}

export function coordLabel(lat: number | null, lng: number | null): string {
  if (lat == null || lng == null) return "—";
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}
