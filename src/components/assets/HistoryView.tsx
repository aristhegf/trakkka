"use client";

import { useEffect, useMemo, useState } from "react";
import { Route } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { AssetMap } from "@/components/map/AssetMap";
import { useAssetStore } from "@/components/store/AssetStore";
import { Input } from "@/components/motion/input";
import { Loader } from "@/components/motion/loader";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import { Fact, Section } from "@/components/kit/page";
import { formatDistance, formatDuration, formatSpeedKph, formatTime, formatDateTime } from "@/lib/format";
import type { AssetOverview, HistoryPoint, HistoryStats, Stop } from "@/lib/types";

type Range = "today" | "yesterday" | "7d" | "30d" | "custom";
const RANGES: { key: Range; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
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
      <Tabs value={range} onValueChange={(v) => setRange(v as Range)} variant="pill" className="no-scrollbar -mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <TabsList className="border border-border">
          {RANGES.map((r) => (
            <TabsTrigger key={r.key} value={r.key} className="h-9">
              {r.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {range === "custom" ? (
        <div className="grid grid-cols-2 gap-3 md:max-w-lg">
          <Input label="From" type="datetime-local" value={custom.from} onChange={(v) => setCustom((c) => ({ ...c, from: v }))} />
          <Input label="To" type="datetime-local" value={custom.to} onChange={(v) => setCustom((c) => ({ ...c, to: v }))} />
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-5">
        <div className="relative h-72 overflow-hidden rounded-3xl border border-border md:col-span-3 md:h-[480px]">
          <AssetMap assets={[asset]} freshnessOf={freshnessOf} selectedId={asset.id} trail={points} fitOnLoad={points.length < 2} controls="compact" />
          {loading ? (
            <div className="absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-1.5 text-xs shadow-sm">
              <Loader variant="spinner" size={14} /> Loading route…
            </div>
          ) : null}
        </div>

        <div className="space-y-4 md:col-span-2">
          {error ? <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p> : null}
          <div className="grid grid-cols-2 gap-2">
            <Fact label="Distance" value={loading ? "…" : formatDistance(stats?.distance_m)} />
            <Fact label={asset.type === "vehicle" ? "Driving time" : "Moving time"} value={loading ? "…" : formatDuration(stats?.moving_seconds)} />
            {asset.type === "vehicle" || asset.type === "pet" ? <Fact label="Top speed" value={loading ? "…" : formatSpeedKph(stats?.max_speed_mps)} /> : null}
            {asset.type === "vehicle" ? <Fact label="Average speed" value={loading ? "…" : formatSpeedKph(stats?.avg_moving_speed_mps)} /> : null}
            <Fact label="Stops" value={loading ? "…" : String(stops.length)} detail="5 minutes or longer" />
            <Fact label="Location updates" value={loading ? "…" : String(stats?.point_count ?? 0)} />
            {asset.type === "pet" && home && homeLink ? <Fact label="Home" value={homeLink.is_inside ? "At home" : homeLink.is_inside === false ? "Away" : "Unknown"} detail={homeLink.is_inside === false && homeLink.last_transition_at ? `Left at ${formatTime(homeLink.last_transition_at, timezone)}` : undefined} /> : null}
          </div>

          {stops.length > 0 ? (
            <Section title="Stops">
              <ul className="scroll-thin -mx-1 max-h-52 space-y-1 overflow-y-auto px-1">
                {stops.map((s, i) => (
                  <li key={i} className="flex items-center justify-between rounded-xl px-2 py-1.5 text-sm odd:bg-muted/50">
                    <span>
                      {formatTime(s.started_at, timezone)} – {formatTime(s.ended_at, timezone)}
                    </span>
                    <span className="text-muted-foreground">{formatDuration(s.duration_s)}</span>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          <Section title="Timeline" description="Newest first">
            {points.length === 0 ? (
              loading ? (
                <div className="grid place-items-center py-6">
                  <Loader variant="dots" size={24} />
                </div>
              ) : (
                <div className="flex flex-col items-center py-6 text-center text-muted-foreground">
                  <Route className="mb-2 h-6 w-6" />
                  <p className="text-sm">No locations in this period.</p>
                </div>
              )
            ) : (
              <ol className="scroll-thin -mx-1 max-h-80 overflow-y-auto px-1">
                {[...points]
                  .reverse()
                  .slice(0, 300)
                  .map((p) => (
                    <li key={p.id} className="relative border-l border-border py-1.5 pl-4">
                      <span className="absolute -left-[4.5px] top-3 h-2 w-2 rounded-full bg-primary" aria-hidden />
                      <p className="text-sm font-medium">{formatDateTime(p.recorded_at, timezone)}</p>
                      <p className="text-xs text-muted-foreground">
                        {[p.speed_mps != null && p.speed_mps > 0.8 ? formatSpeedKph(p.speed_mps) : "Not moving", p.accuracy_m != null ? `within ${Math.round(p.accuracy_m)} m` : null, p.battery_level != null ? `battery ${p.battery_level}%` : null].filter(Boolean).join(" · ")}
                      </p>
                    </li>
                  ))}
              </ol>
            )}
          </Section>
          <p className="px-1 text-xs text-muted-foreground">Every location is kept for 90 days, then summarised. Routes show at most 2,000 points.</p>
        </div>
      </div>
    </div>
  );
}
