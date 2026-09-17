"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Box, Car, ChevronUp, PawPrint, Plus, Search, Smartphone } from "lucide-react";
import { useAssetStore } from "@/components/store/AssetStore";
import { AssetMap } from "@/components/map/AssetMap";
import { AssetRow } from "./AssetRow";
import { AssetSummary } from "./AssetSummary";
import { BottomSheet } from "@/components/motion/bottom-sheet";
import { MorphingSearch, type MorphingSearchItem } from "@/components/motion/morphing-search";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import { Input } from "@/components/motion/input";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { EmptyState } from "@/components/kit/page";
import { LogoMark } from "@/components/shell/AppShell";
import { useIsPhone } from "@/components/kit/media";
import { useBackToClose } from "@/components/kit/back";
import { describeWhere } from "@/lib/describe";
import type { AssetOverview, Freshness } from "@/lib/types";
import { cn } from "@/lib/utils";

type Filter = "all" | "attention" | "device" | "pet" | "vehicle";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "attention", label: "Needs attention" },
  { key: "device", label: "Devices" },
  { key: "pet", label: "Pets" },
  { key: "vehicle", label: "Vehicles" },
];

const TYPE_ICON = { pet: PawPrint, vehicle: Car, device: Smartphone, other: Box } as const;

/** Lower sorts first: problems, then live, then older, then never located. */
function rank(a: AssetOverview, f: Freshness): number {
  if ((a.open_alert_count ?? 0) > 0) return 0;
  return { live: 1, recent: 2, stale: 3, offline: 3, unknown: 4 }[f];
}

function needsAttention(a: AssetOverview, f: Freshness) {
  return (a.open_alert_count ?? 0) > 0 || f === "stale" || f === "offline";
}

export function Dashboard() {
  const { assetList, freshnessOf, geofences, now } = useAssetStore();
  const params = useSearchParams();
  const assetParam = params.get("asset");
  const [selectedId, setSelectedId] = useState<string | null>(assetParam);
  const [focusId, setFocusId] = useState<string | null>(assetParam);
  const [prevParam, setPrevParam] = useState(assetParam);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const isPhone = useIsPhone();

  if (assetParam !== prevParam) {
    setPrevParam(assetParam);
    if (assetParam) {
      setSelectedId(assetParam);
      setFocusId(assetParam);
    }
  }

  const select = useCallback((id: string | null, focus = true) => {
    setSelectedId(id);
    if (focus) setFocusId(id);
    if (id) setListOpen(false);
  }, []);

  const sorted = useMemo(
    () => [...assetList].sort((a, b) => rank(a, freshnessOf(a)) - rank(b, freshnessOf(b)) || a.name.localeCompare(b.name)),
    [assetList, freshnessOf],
  );

  const counts = useMemo(() => {
    let live = 0,
      moving = 0,
      attention = 0;
    for (const a of assetList) {
      const f = freshnessOf(a);
      if (f === "live" || f === "recent") live++;
      if (a.movement_state === "moving" && (f === "live" || f === "recent")) moving++;
      if (needsAttention(a, f)) attention++;
    }
    return { total: assetList.length, live, moving, attention };
  }, [assetList, freshnessOf]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sorted.filter((a) => {
      const f = freshnessOf(a);
      if (filter === "attention" && !needsAttention(a, f)) return false;
      if (filter !== "all" && filter !== "attention" && a.type !== filter) return false;
      if (!q) return true;
      return a.name.toLowerCase().includes(q) || describeWhere(a, geofences).title.toLowerCase().includes(q);
    });
  }, [sorted, filter, query, freshnessOf, geofences]);

  const searchItems = useMemo<MorphingSearchItem[]>(
    () =>
      sorted.map((a) => ({
        id: a.id,
        title: a.name,
        description: describeWhere(a, geofences).title,
        icon: TYPE_ICON[a.type],
        keywords: [a.type, a.place_label ?? ""],
        onSelect: () => select(a.id),
      })),
    [sorted, geofences, select],
  );

  const selected = selectedId ? assetList.find((a) => a.id === selectedId) ?? null : null;

  // Phone: Back closes the open sheet instead of leaving the map. Desktop panels are not overlays.
  useBackToClose(isPhone && listOpen, () => setListOpen(false));
  useBackToClose(isPhone && Boolean(selected), () => select(null, false));
  const summaryLine = counts.total === 0 ? "No assets yet" : `${counts.live} of ${counts.total} reporting${counts.moving ? ` · ${counts.moving} moving` : ""}`;

  const list = (
    <div className="space-y-1">
      {filtered.length === 0 ? (
        <p className="px-3 py-8 text-center text-sm text-muted-foreground">{assetList.length === 0 ? "Nothing to show yet." : "Nothing matches this filter."}</p>
      ) : (
        filtered.map((a) => <AssetRow key={a.id} asset={a} freshness={freshnessOf(a)} places={geofences} now={now} selected={a.id === selectedId} onClick={() => select(a.id)} />)
      )}
    </div>
  );

  const filterTabs = (
    <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)} variant="pill">
      <TabsList className="no-scrollbar flex max-w-full overflow-x-auto bg-muted">
        {FILTERS.map((f) => (
          <TabsTrigger key={f.key} value={f.key} className="h-11 px-3 text-[13px]">
            {f.label}
            {f.key === "attention" && counts.attention > 0 ? ` (${counts.attention})` : ""}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );

  if (assetList.length === 0) {
    return (
      <div className="relative h-full">
        <AssetMap assets={[]} freshnessOf={freshnessOf} geofences={geofences} controls="none" />
        <div className="absolute inset-0 grid place-items-center bg-background/60 p-6 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-2 shadow-xl">
            <EmptyState
              icon={<Smartphone />}
              title="Add your first asset"
              body="Start with your phone. Trakkka shows where it is, whether the location is live, and its battery."
              action={
                <Link href="/assets/new" className="inline-flex h-11 items-center gap-1.5 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground">
                  <Plus className="h-4 w-4" /> Add asset
                </Link>
              }
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      {/* ---------- Desktop list ---------- */}
      <aside className="hidden w-[400px] shrink-0 flex-col border-r border-border bg-background md:flex">
        <div className="space-y-4 p-5 pb-3">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold tracking-tight">Your assets</h1>
            <Link href="/assets/new" className="inline-flex h-9 items-center gap-1 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <Plus className="h-4 w-4" /> Add
            </Link>
          </div>
          <dl className="grid grid-cols-3 gap-2">
            <Stat label="Reporting" value={counts.live} total={counts.total} />
            <Stat label="Moving" value={counts.moving} />
            <Stat label="Needs attention" value={counts.attention} tone={counts.attention ? "danger" : undefined} />
          </dl>
          <Input leftIcon={<Search />} placeholder="Search by name or place" value={query} onChange={setQuery} aria-label="Search assets" />
          {filterTabs}
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 pb-4">{list}</div>
      </aside>

      {/* ---------- Map ---------- */}
      <div className="relative min-w-0 flex-1">
        <AssetMap
          assets={assetList}
          freshnessOf={freshnessOf}
          selectedId={selectedId}
          onSelect={(id) => select(id, false)}
          geofences={geofences}
          focusId={focusId}
          controls="full"
          className="map-under-nav"
          controlsClassName="max-md:top-auto max-md:bottom-[calc(21rem+env(safe-area-inset-bottom))]"
          // Keep the asset visible above the phone card/sheet, or left of the desktop panel.
          fitPadding={isPhone ? { top: 60, bottom: selected ? 440 : 250 } : { right: selected ? 400 : 0 }}
        />

        {/* Desktop: selected asset panel */}
        {selected ? (
          <div className="scroll-thin absolute bottom-4 right-4 top-4 hidden w-[380px] overflow-y-auto rounded-3xl border border-border bg-background/95 p-5 shadow-2xl backdrop-blur md:block">
            <AssetSummary asset={selected} freshness={freshnessOf(selected)} onClose={() => select(null)} />
          </div>
        ) : null}

        {/* ---------- Phone overlays ---------- */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:hidden">
          <div className="pointer-events-auto flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl border border-border bg-card/95 px-3 py-2 shadow-lg backdrop-blur">
            <LogoMark className="h-8 w-8 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight">Trakkka</p>
              <p className="truncate text-xs text-muted-foreground">{summaryLine}</p>
            </div>
          </div>
          <MorphingSearch iconOnly items={searchItems} placeholder="Find an asset" emptyMessage="No asset with that name" className="pointer-events-auto" />
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-10 px-3 md:hidden">
          <div className="pointer-events-auto rounded-3xl border border-border bg-card/95 p-2 shadow-xl backdrop-blur">
            <button type="button" onClick={() => setListOpen(true)} className="flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left active:bg-muted">
              <span>
                <span className="block text-[15px] font-semibold">Your assets</span>
                <span className="block text-xs text-muted-foreground">{counts.attention > 0 ? `${counts.attention} need${counts.attention === 1 ? "s" : ""} attention` : "Tap one to see where it is"}</span>
              </span>
              <span className="flex items-center gap-1 text-sm font-medium text-primary">
                All {counts.total} <ChevronUp className="h-4 w-4" />
              </span>
            </button>
            <div className="mt-1">
              {sorted.slice(0, 2).map((a) => (
                <AssetRow key={a.id} asset={a} freshness={freshnessOf(a)} places={geofences} now={now} onClick={() => select(a.id)} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Phone: full list */}
      <div className="md:hidden">
        <BottomSheet open={listOpen} onOpenChange={setListOpen} snapPoints={[0.7, 0.94]} title="Your assets" description={summaryLine}>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Input leftIcon={<Search />} placeholder="Search by name or place" value={query} onChange={setQuery} aria-label="Search assets" className="flex-1" />
              <Link href="/assets/new" aria-label="Add asset" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                <Plus className="h-5 w-5" />
              </Link>
            </div>
            {filterTabs}
            {list}
          </div>
        </BottomSheet>

        {/* Phone: selected asset */}
        <BottomSheet open={Boolean(selected)} onOpenChange={(o) => !o && select(null, false)} snapPoints={[0.58, 0.94]} backdropClassName="bg-black/10 backdrop-blur-none">
          {selected ? <AssetSummary asset={selected} freshness={freshnessOf(selected)} /> : null}
        </BottomSheet>
      </div>
    </div>
  );
}

function Stat({ label, value, total, tone }: { label: string; value: number; total?: number; tone?: "danger" }) {
  return (
    <div className="rounded-2xl bg-muted/70 px-3 py-2.5">
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("text-xl font-semibold tabular-nums", tone === "danger" && "text-destructive")}>
        <AnimatedNumber value={value} />
        {total != null ? <span className="text-sm font-normal text-muted-foreground">/{total}</span> : null}
      </dd>
    </div>
  );
}
