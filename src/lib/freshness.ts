import type { ConnectionStatus, Freshness } from "./types";

export interface FreshnessThresholds {
  liveAfterS: number;
  recentAfterS: number;
  staleAfterS: number;
}

export const DEFAULT_THRESHOLDS: FreshnessThresholds = { liveAfterS: 30, recentAfterS: 300, staleAfterS: 900 };

/**
 * Derives the freshness state. Never stored; recomputed on every render tick.
 *
 * - unknown : no location has ever been received
 * - offline : the provider explicitly reported offline (never inferred from silence)
 * - live    : age < liveAfterS (a provider with liveAfterS = 0 can never be live)
 * - recent  : age < recentAfterS
 * - stale   : otherwise
 */
export function deriveFreshness(
  lastLocationAt: string | Date | null | undefined,
  connectionStatus: ConnectionStatus | null | undefined,
  thresholds: FreshnessThresholds = DEFAULT_THRESHOLDS,
  now: Date = new Date(),
): Freshness {
  if (!lastLocationAt) return "unknown";
  if (connectionStatus === "offline") return "offline";
  const ageS = ageSeconds(lastLocationAt, now);
  if (ageS < thresholds.liveAfterS) return "live";
  if (ageS < thresholds.recentAfterS) return "recent";
  return "stale";
}

export function ageSeconds(at: string | Date, now: Date = new Date()): number {
  const t = typeof at === "string" ? Date.parse(at) : at.getTime();
  return Math.max(0, (now.getTime() - t) / 1000);
}

export const FRESHNESS_LABEL: Record<Freshness, string> = {
  live: "Live",
  recent: "Recent",
  stale: "Stale",
  offline: "Offline",
  unknown: "No location",
};

/** Tailwind colour tokens per freshness state (see globals.css for the CSS variables). */
export const FRESHNESS_COLOR: Record<Freshness, string> = {
  live: "#22c55e",
  recent: "#eab308",
  stale: "#f97316",
  offline: "#ef4444",
  unknown: "#9ca3af",
};

export function thresholdsFrom(row: {
  live_after_s?: number | null;
  recent_after_s?: number | null;
  stale_after_s?: number | null;
}): FreshnessThresholds {
  return {
    liveAfterS: row.live_after_s ?? DEFAULT_THRESHOLDS.liveAfterS,
    recentAfterS: row.recent_after_s ?? DEFAULT_THRESHOLDS.recentAfterS,
    staleAfterS: row.stale_after_s ?? DEFAULT_THRESHOLDS.staleAfterS,
  };
}
