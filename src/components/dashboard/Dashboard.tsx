"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { useAssetStore } from "@/components/store/AssetStore";
import { AssetMap } from "@/components/map/AssetMap";
import { AssetListItem } from "./AssetListItem";
import { StatsBar, type Section } from "./StatsBar";
import { DetailPanel } from "./DetailPanel";
import { BottomSheet } from "./BottomSheet";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import type { AssetOverview } from "@/lib/types";

const SECTIONS: { key: Section; label: string }[] = [
  { key: "all", label: "All" },
  { key: "device", label: "Devices" },
  { key: "pet", label: "Pets" },
  { key: "vehicle", label: "Vehicles" },
  { key: "offline", label: "Offline" },
  { key: "alerts", label: "Alerts" },
];

export function Dashboard() {
  const { assetList, freshnessOf, geofences, alerts } = useAssetStore();
  const router = useRouter();
  const params = useSearchParams();
  const [section, setSection] = useState<Section>("all");
  const [query, setQuery] = useState("");
  const assetParam = params.get("asset");
  const [selectedId, setSelectedId] = useState<string | null>(assetParam);
  const [focusId, setFocusId] = useState<string | null>(assetParam);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [prevAssetParam, setPrevAssetParam] = useState(assetParam);

  // Navigation to /dashboard?asset=… (e.g. from a detail page) selects and centres that asset.
  if (assetParam !== prevAssetParam) {
    setPrevAssetParam(assetParam);
    if (assetParam) {
      setSelectedId(assetParam);
      setFocusId(assetParam);
    }
  }

  const select = useCallback(
    (id: string | null, focus = true) => {
      setSelectedId(id);
      if (focus) setFocusId(id);
      setSheetOpen(Boolean(id));
      const url = id ? `/dashboard?asset=${id}` : "/dashboard";
      window.history.replaceState(null, "", url);
    },
    [],
  );

  const counts = useMemo(() => {
    let online = 0,
      moving = 0,
      offline = 0;
    for (const a of assetList) {
      const f = freshnessOf(a);
      if (f === "live" || f === "recent") online++;
      if (f === "offline" || f === "stale") offline++;
      if (a.movement_state === "moving" && (f === "live" || f === "recent")) moving++;
    }
    const openAlerts = alerts.filter((a) => !a.acknowledged_at && !a.resolved_at).length;
    return { total: assetList.length, online, moving, offline, openAlerts };
  }, [assetList, freshnessOf, alerts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assetList.filter((a) => {
      if (q && !a.name.toLowerCase().includes(q) && !(a.place_label ?? "").toLowerCase().includes(q)) return false;
      const f = freshnessOf(a);
      switch (section) {
        case "device":
        case "pet":
        case "vehicle":
          return a.type === section;
        case "offline":
          return f === "offline" || f === "stale";
        case "alerts":
          return (a.open_alert_count ?? 0) > 0;
        default:
          return true;
      }
    });
  }, [assetList, section, query, freshnessOf]);

  const selected: AssetOverview | null = selectedId ? assetList.find((a) => a.id === selectedId) ?? null : null;

  return (
    <div className="flex h-full min-h-0">
      {/* Desktop sidebar */}
      <aside className="hidden w-[340px] shrink-0 flex-col border-r border-border bg-surface md:flex">
        <div className="border-b border-border p-3">
          <div className="mb-3 flex items-center justify-between">
            <h1 className="text-base font-semibold">Assets</h1>
            <Link href="/assets/new" className="inline-flex h-8 items-center gap-1 rounded-lg bg-accent px-3 text-xs font-medium text-accent-foreground hover:bg-accent/90">
              <Plus className="h-3.5 w-3.5" /> Add
            </Link>
          </div>
          <StatsBar counts={counts} section={section} onSection={setSection} />
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted" />
            <Input placeholder="Search assets or places" value={query} onChange={(e) => setQuery(e.target.value)} className="h-9 pl-8" aria-label="Search assets" />
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-b border-border px-2 py-1.5 text-xs" aria-label="Sections">
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSection(s.key)}
              className={cn("shrink-0 rounded-md px-2.5 py-1 font-medium text-muted hover:bg-surface-2", section === s.key && "bg-accent/15 text-accent")}
            >
              {s.label}
            </button>
          ))}
        </nav>
        <ul className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <li className="p-6 text-center text-sm text-muted">
              {assetList.length === 0 ? (
                <>
                  No assets yet.{" "}
                  <Link href="/assets/new" className="text-accent hover:underline">
                    Add your first one.
                  </Link>
                </>
              ) : (
                "Nothing matches."
              )}
            </li>
          ) : (
            filtered.map((a) => <AssetListItem key={a.id} asset={a} freshness={freshnessOf(a)} selected={a.id === selectedId} onClick={() => select(a.id)} />)
          )}
        </ul>
      </aside>

      {/* Map */}
      <div className="relative min-w-0 flex-1">
        <AssetMap assets={assetList} freshnessOf={freshnessOf} selectedId={selectedId} onSelect={(id) => select(id, false)} geofences={geofences} focusId={focusId} />
        {/* Mobile top chips */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-2 p-2 md:hidden">
          <div className="pointer-events-auto flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted" />
              <Input placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} className="h-9 bg-surface pl-8 shadow-md" aria-label="Search assets" />
            </div>
            <Link href="/assets/new" aria-label="Add asset" className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground shadow-md">
              <Plus className="h-4 w-4" />
            </Link>
          </div>
          <div className="pointer-events-auto flex gap-1.5 overflow-x-auto pb-1">
            {SECTIONS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setSection(s.key)}
                className={cn("shrink-0 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium shadow-sm", section === s.key && "border-accent bg-accent text-accent-foreground")}
              >
                {s.label}
                {s.key === "all" ? ` ${counts.total}` : s.key === "offline" ? ` ${counts.offline}` : s.key === "alerts" ? ` ${counts.openAlerts}` : ""}
              </button>
            ))}
          </div>
        </div>
        {/* Desktop detail panel */}
        {selected ? (
          <div className="absolute bottom-3 right-3 top-3 hidden w-[360px] md:block">
            <DetailPanel asset={selected} freshness={freshnessOf(selected)} onClose={() => select(null)} />
          </div>
        ) : null}
      </div>

      {/* Mobile bottom sheet: list or selected asset */}
      <BottomSheet open={sheetOpen || !selected} onOpenChange={setSheetOpen} peekLabel={`${counts.total} assets · ${counts.online} online · ${counts.moving} moving`}>
        {selected ? (
          <DetailPanel asset={selected} freshness={freshnessOf(selected)} onClose={() => select(null)} embedded />
        ) : (
          <ul className="divide-y divide-border">
            {filtered.length === 0 ? (
              <li className="p-6 text-center text-sm text-muted">No assets here.</li>
            ) : (
              filtered.map((a) => <AssetListItem key={a.id} asset={a} freshness={freshnessOf(a)} selected={false} onClick={() => select(a.id)} />)
            )}
          </ul>
        )}
      </BottomSheet>
      <span className="hidden" aria-hidden onClick={() => router.refresh()} />
    </div>
  );
}
