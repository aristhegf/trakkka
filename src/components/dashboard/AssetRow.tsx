"use client";

import { BatteryLow, BatteryMedium, BatteryFull } from "lucide-react";
import type { AssetOverview, Freshness, Geofence } from "@/lib/types";
import { AssetIcon } from "@/components/assets/AssetIcon";
import { FreshnessBadge } from "@/components/kit/status";
import { describeMovement, describeWhere } from "@/lib/describe";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export function Battery({ level, className }: { level: number | null; className?: string }) {
  if (level == null) return null;
  const Icon = level <= 20 ? BatteryLow : level <= 60 ? BatteryMedium : BatteryFull;
  return (
    <span className={cn("inline-flex items-center gap-1", level <= 20 && "text-destructive", className)}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {level}%
    </span>
  );
}

/** One asset in a list: what, where (in words), how fresh, and anything that needs attention. */
export function AssetRow({ asset, freshness, places, now, selected = false, onClick }: { asset: AssetOverview; freshness: Freshness; places: Geofence[]; now: Date; selected?: boolean; onClick: () => void }) {
  const where = describeWhere(asset, places);
  const movement = describeMovement(asset, freshness);
  const alerts = asset.open_alert_count ?? 0;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={selected ? "true" : undefined}
      className={cn("flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-muted/70 active:bg-muted", selected && "bg-primary/10 hover:bg-primary/10")}
    >
      <AssetIcon type={asset.type} freshness={freshness} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold">{asset.name}</p>
        <p className="truncate text-sm text-muted-foreground">
          {where.hasLocation ? (
            <>
              {where.title} <span aria-hidden>·</span> {relativeTime(asset.last_location_at, now)}
            </>
          ) : (
            "Waiting for its first location"
          )}
        </p>
        {movement || asset.battery_level != null || alerts > 0 ? (
          <p className="mt-0.5 flex items-center gap-2 truncate text-xs text-muted-foreground">
            {alerts > 0 ? <span className="font-medium text-destructive">{alerts === 1 ? "1 alert" : `${alerts} alerts`}</span> : null}
            {movement ? <span>{movement}</span> : null}
            <Battery level={asset.battery_level} />
          </p>
        ) : null}
      </div>
      <FreshnessBadge freshness={freshness} className="shrink-0" />
    </button>
  );
}
