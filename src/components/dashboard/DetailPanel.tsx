"use client";

import Link from "next/link";
import { Bell, Fence, History, Settings, X, Wifi, WifiOff, Navigation, Gauge, MapPin, Clock, Crosshair } from "lucide-react";
import type { AssetOverview, Freshness } from "@/lib/types";
import { AssetIcon, TYPE_LABEL } from "@/components/assets/AssetIcon";
import { FreshnessBadge, Badge } from "@/components/ui/badge";
import { relativeTime, formatSpeedKph, formatAccuracy, coordLabel, formatDateTime } from "@/lib/format";
import { useAssetStore } from "@/components/store/AssetStore";
import { BatteryIcon } from "./AssetListItem";
import { cn } from "@/lib/cn";

export function DetailPanel({ asset, freshness, onClose, embedded = false }: { asset: AssetOverview; freshness: Freshness; onClose: () => void; embedded?: boolean }) {
  const { now, alerts, geofences, providers, timezone } = useAssetStore();
  const provider = asset.tracking_provider_key ? providers[asset.tracking_provider_key] : undefined;
  const assetAlerts = alerts.filter((a) => a.asset_id === asset.id && !a.acknowledged_at && !a.resolved_at);
  const inside = geofences.filter((g) => g.assets.some((l) => l.asset_id === asset.id && l.is_inside));
  const moving = asset.movement_state === "moving" && (freshness === "live" || freshness === "recent");
  const status = !asset.last_location_at ? "No location yet" : moving ? (asset.type === "vehicle" ? "Driving" : "Moving") : asset.movement_state === "stationary" ? "Stationary" : "Unknown";

  return (
    <section className={cn("flex h-full flex-col overflow-hidden bg-surface", !embedded && "rounded-2xl border border-border shadow-xl")} aria-label={`${asset.name} details`}>
      <header className="flex items-start gap-3 border-b border-border p-4">
        <AssetIcon type={asset.type} size="md" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold">{asset.name}</h2>
          <p className="text-xs text-muted">
            {TYPE_LABEL[asset.type]}
            {provider ? ` · ${provider.name}` : ""}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <FreshnessBadge freshness={freshness} ageLabel={asset.last_location_at ? relativeTime(asset.last_location_at, now) : undefined} />
            {asset.connection_status === "offline" ? (
              <Badge tone="danger">
                <WifiOff className="h-3 w-3" /> Tracker offline
              </Badge>
            ) : asset.connection_status === "online" && provider?.capabilities.connection ? (
              <Badge tone="neutral">
                <Wifi className="h-3 w-3" /> Connected
              </Badge>
            ) : null}
            {!asset.is_tracking_enabled ? <Badge tone="warning">Tracking paused</Badge> : null}
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-4">
        {assetAlerts.length > 0 ? (
          <ul className="mb-3 space-y-1.5">
            {assetAlerts.slice(0, 3).map((a) => (
              <li key={a.id} className={cn("rounded-lg border px-3 py-2 text-xs", a.severity === "critical" ? "border-danger/40 bg-danger/10 text-danger" : "border-warning/40 bg-warning/10 text-warning")}>
                <span className="font-medium">{a.title}</span> <span className="opacity-70">· {relativeTime(a.triggered_at, now)}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <dl className="grid grid-cols-2 gap-3">
          <Stat icon={Navigation} label="Status" value={status} />
          <Stat icon={Clock} label="Last updated" value={asset.last_location_at ? relativeTime(asset.last_location_at, now) : "—"} sub={asset.last_location_at ? formatDateTime(asset.last_location_at, timezone) : undefined} />
          <Stat icon={MapPin} label="Location" value={asset.place_label ?? (asset.latitude != null ? "Unnamed area" : "—")} sub={coordLabel(asset.latitude, asset.longitude)} />
          <Stat icon={Crosshair} label="Accuracy" value={asset.last_location_at ? formatAccuracy(asset.accuracy_m) : "—"} sub={asset.accuracy_m != null && asset.accuracy_m > 100 ? "Approximate" : undefined} />
          {provider?.capabilities.battery ? (
            <Stat
              icon={() => <BatteryIcon level={asset.battery_level} className="h-4 w-4" />}
              label="Battery"
              value={asset.battery_level != null ? `${asset.battery_level}%` : "—"}
              sub={asset.battery_updated_at ? relativeTime(asset.battery_updated_at, now) : undefined}
            />
          ) : null}
          {asset.type === "vehicle" || provider?.capabilities.speed ? <Stat icon={Gauge} label="Speed" value={moving ? formatSpeedKph(asset.speed_mps) : "0 km/h"} /> : null}
        </dl>

        {inside.length > 0 ? (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
            <Fence className="h-3.5 w-3.5" /> Inside {inside.map((g) => g.name).join(", ")}
          </p>
        ) : null}
        <p className="mt-3 text-[11px] text-muted">
          Source: {asset.last_source ?? provider?.key ?? "—"}
          {asset.last_received_at ? ` · received ${relativeTime(asset.last_received_at, now)}` : ""}
        </p>
      </div>

      <footer className="grid grid-cols-4 gap-1 border-t border-border p-2">
        <FooterLink href={`/assets/${asset.id}`} icon={MapPin} label="Details" />
        <FooterLink href={`/assets/${asset.id}?tab=history`} icon={History} label="History" />
        <FooterLink href={`/assets/${asset.id}?tab=geofences`} icon={Fence} label="Geofences" />
        <FooterLink href={`/assets/${asset.id}?tab=alerts`} icon={Bell} label="Alerts" badge={assetAlerts.length} />
      </footer>
    </section>
  );
}

function Stat({ icon: Icon, label, value, sub }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-2.5">
      <dt className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted">
        <Icon className="h-3 w-3" /> {label}
      </dt>
      <dd className="mt-0.5 truncate text-sm font-medium" title={value}>
        {value}
      </dd>
      {sub ? <dd className="truncate text-[11px] text-muted">{sub}</dd> : null}
    </div>
  );
}

function FooterLink({ href, icon: Icon, label, badge }: { href: string; icon: React.ComponentType<{ className?: string }>; label: string; badge?: number }) {
  return (
    <Link href={href} className="relative flex flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[11px] font-medium text-muted hover:bg-surface-2 hover:text-foreground">
      <Icon className="h-4 w-4" />
      {label}
      {badge ? <span className="absolute right-2 top-0.5 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] font-semibold leading-4 text-white">{badge}</span> : null}
    </Link>
  );
}

export { Settings as SettingsIcon };
