"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AssetMap } from "@/components/map/AssetMap";
import { useAssetStore } from "@/components/store/AssetStore";
import { Input } from "@/components/ui/input";
import { formatDistance, formatDuration, formatSpeedKph, formatTime, formatDateTime } from "@/lib/format";
import type { AssetOverview, HistoryPoint, HistoryStats, Stop } from "@/lib/types";
import { cn } from "@/lib/cn";

type Range = "today" | "yesterday" | "7d" | "30d" | "custom";
const RANGES: { key: Range; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "custom", label: "Custom" },
];

function rangeBounds(r: Range, custom: { from: string; to: string }): { from: Date; to: Date } {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  switch (r) {
    case "today":
      return { from: startOfDay(now), to: now };
    case "yesterday": {
      const y = startOfDay(new Date(now.getTime() - 86400000));
      return { from: y, to: new Date(y.getTime() + 86400000 - 1) };
    }
    case "7d":
      return { from: new Date(now.getTime() - 7 * 86400000), to: now };
    case "30d":
      return { from: new Date(now.getTime() - 30 * 86400000), to: now };
    default: {
      const from = custom.from ? new Date(custom.from) : startOfDay(now);
      const to = custom.to ? new Date(custom.to) : now;
      return { from, to };
    }
  }
}

export function HistoryView({ asset }: { asset: AssetOverview }) {
  const { freshnessOf, geofences, timezone } = useAssetStore();
  const [range, setRange] = useState<Range>("today");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const supabase = useMemo(() => createClient(), []);
  const bounds = useMemo(() => rangeBounds(range, custom), [range, custom]);
  const queryKey = `${asset.id}|${bounds.from.toISOString()}|${bounds.to.toISOString()}`;
  // Result is keyed by the query it answers; "loading" is derived, so no setState runs inside the effect body.
  const [result, setResult] = useState<{ key: string; points: HistoryPoint[]; stats: HistoryStats | null; stops: Stop[]; error: string | null }>({
    key: "",
    points: [],
    stats: null,
    stops: [],
    error: null,
  });
  const loading = result.key !== queryKey;
  const { points, stats, stops, error } = loading ? { points: [], stats: null, stops: [], error: null } : result;

  useEffect(() => {
    let cancelled = false;
    const args = { p_asset_id: asset.id, p_from: bounds.from.toISOString(), p_to: bounds.to.toISOString() };
    Promise.all([
      supabase.rpc("get_location_history", { ...args, p_max_points: 2000 }),
      supabase.rpc("get_history_stats", args),
      supabase.rpc("get_stops", args),
    ]).then(([h, s, st]) => {
      if (cancelled) return;
      setResult({
        key: queryKey,
        points: (h.data ?? []) as HistoryPoint[],
        stats: (s.data as HistoryStats) ?? null,
        stops: (st.data ?? []) as Stop[],
        error: h.error || s.error || st.error ? ((h.error ?? s.error ?? st.error)?.message ?? "Failed to load") : null,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [asset.id, bounds, supabase, queryKey]);

  const home = geofences.find((g) => g.name.toLowerCase() === "home");
  const homeLink = home?.assets.find((l) => l.asset_id === asset.id);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {RANGES.map((r) => (
          <button key={r.key} type="button" onClick={() => setRange(r.key)} className={cn("rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-surface-2", range === r.key && "border-accent bg-accent text-accent-foreground hover:bg-accent")}>
            {r.label}
          </button>
        ))}
        {range === "custom" ? (
          <div className="flex items-center gap-1.5">
            <Input type="datetime-local" className="h-8 w-auto text-xs" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} aria-label="From" />
            <span className="text-xs text-muted">to</span>
            <Input type="datetime-local" className="h-8 w-auto text-xs" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} aria-label="To" />
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <div className="relative h-72 overflow-hidden rounded-xl border border-border md:col-span-3 md:h-[440px]">
          <AssetMap assets={[asset]} freshnessOf={freshnessOf} selectedId={asset.id} trail={points} fitOnLoad={points.length < 2} showControls />
          {loading ? <div className="absolute inset-x-0 top-0 bg-surface/80 py-1 text-center text-xs text-muted">Loading…</div> : null}
        </div>
        <div className="space-y-3 md:col-span-2">
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <Stat label="Distance" value={formatDistance(stats?.distance_m)} />
            <Stat label={asset.type === "vehicle" ? "Driving time" : "Moving time"} value={formatDuration(stats?.moving_seconds)} />
            {asset.type === "vehicle" || asset.type === "pet" ? <Stat label="Max speed" value={formatSpeedKph(stats?.max_speed_mps)} /> : null}
            {asset.type === "vehicle" ? <Stat label="Avg moving speed" value={formatSpeedKph(stats?.avg_moving_speed_mps)} /> : null}
            <Stat label="Stops" value={String(stops.length)} />
            <Stat label="Fixes" value={String(stats?.point_count ?? 0)} />
            {asset.type === "pet" && home && homeLink ? <Stat label="Home" value={homeLink.is_inside ? "Inside" : homeLink.is_inside === false ? `Away${homeLink.last_transition_at ? ` since ${formatTime(homeLink.last_transition_at, timezone)}` : ""}` : "Unknown"} /> : null}
          </dl>

          {stops.length > 0 ? (
            <div className="rounded-lg border border-border bg-surface">
              <p className="border-b border-border px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted">Stops (≥ 5 min)</p>
              <ul className="scroll-thin max-h-48 divide-y divide-border overflow-y-auto text-sm">
                {stops.map((s, i) => (
                  <li key={i} className="flex justify-between px-3 py-1.5">
                    <span>
                      {formatTime(s.started_at, timezone)} – {formatTime(s.ended_at, timezone)}
                    </span>
                    <span className="text-muted">{formatDuration(s.duration_s)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="rounded-lg border border-border bg-surface">
            <p className="border-b border-border px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted">Timeline</p>
            {points.length === 0 ? (
              <p className="p-3 text-sm text-muted">{loading ? "Loading…" : "No locations in this range."}</p>
            ) : (
              <ul className="scroll-thin max-h-72 divide-y divide-border overflow-y-auto text-xs">
                {[...points].reverse().slice(0, 300).map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                    <span className="font-medium">{formatDateTime(p.recorded_at, timezone)}</span>
                    <span className="truncate text-muted">
                      {p.latitude.toFixed(4)}, {p.longitude.toFixed(4)}
                      {p.accuracy_m != null ? ` ±${Math.round(p.accuracy_m)}m` : ""}
                      {p.speed_mps != null && p.speed_mps > 0.8 ? ` · ${formatSpeedKph(p.speed_mps)}` : ""}
                      {p.battery_level != null ? ` · ${p.battery_level}%` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="text-[11px] text-muted">Raw fixes are kept for 90 days; older days are summarised. Trails are down-sampled to at most 2,000 points.</p>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-2.5">
      <dt className="text-[10px] uppercase tracking-wide text-muted">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
