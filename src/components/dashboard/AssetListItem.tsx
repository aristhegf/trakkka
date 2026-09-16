"use client";

import { BatteryLow, BatteryMedium, BatteryFull, Bell, Navigation } from "lucide-react";
import type { AssetOverview, Freshness } from "@/lib/types";
import { AssetIcon } from "@/components/assets/AssetIcon";
import { relativeTime, formatSpeedKph, coordLabel } from "@/lib/format";
import { useAssetStore } from "@/components/store/AssetStore";
import { cn } from "@/lib/cn";

export function BatteryIcon({ level, className }: { level: number | null; className?: string }) {
  if (level == null) return null;
  const Icon = level <= 20 ? BatteryLow : level <= 60 ? BatteryMedium : BatteryFull;
  return <Icon className={cn("h-3.5 w-3.5", level <= 20 ? "text-danger" : "text-muted", className)} aria-hidden />;
}

export function AssetListItem({ asset, freshness, selected, onClick }: { asset: AssetOverview; freshness: Freshness; selected: boolean; onClick: () => void }) {
  const { now } = useAssetStore();
  const moving = asset.movement_state === "moving" && (freshness === "live" || freshness === "recent");
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn("flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-2", selected && "bg-accent/10")}
        aria-current={selected ? "true" : undefined}
      >
        <div className="relative">
          <AssetIcon type={asset.type} />
          <span className={cn("absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface", `bg-fresh-${freshness}`)} title={freshness} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium">{asset.name}</span>
            {(asset.open_alert_count ?? 0) > 0 ? <Bell className="h-3.5 w-3.5 shrink-0 text-danger" aria-label="Has alerts" /> : null}
            {moving ? <Navigation className="h-3.5 w-3.5 shrink-0 text-accent" aria-label="Moving" /> : null}
          </div>
          <div className="truncate text-xs text-muted">
            {asset.last_location_at ? (
              <>
                {asset.place_label ?? coordLabel(asset.latitude, asset.longitude)} · {relativeTime(asset.last_location_at, now)}
              </>
            ) : (
              "No location yet"
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5 text-xs text-muted">
          {asset.type === "vehicle" && moving ? <span>{formatSpeedKph(asset.speed_mps)}</span> : null}
          {asset.battery_level != null ? (
            <span className="flex items-center gap-1">
              <BatteryIcon level={asset.battery_level} /> {asset.battery_level}%
            </span>
          ) : null}
        </div>
      </button>
    </li>
  );
}
