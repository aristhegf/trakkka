"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Pencil, Pause, Play, Trash2, RotateCw, ExternalLink } from "lucide-react";
import { useAssetStore } from "@/components/store/AssetStore";
import { AssetMap } from "@/components/map/AssetMap";
import { AssetIcon, TYPE_LABEL } from "./AssetIcon";
import { FreshnessBadge, Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shell/PageHeader";
import { HistoryView } from "./HistoryView";
import { ManualCheckIn } from "./ManualCheckIn";
import { BrowserReporter } from "./BrowserReporter";
import { GeofenceAssignments } from "./GeofenceAssignments";
import { AssetAlerts } from "./AssetAlerts";
import { PhotoUpload } from "./PhotoUpload";
import { TokenReveal } from "./TokenReveal";
import { deleteAsset, rotateDeviceToken, setAssetStatus, setTrackingEnabled } from "@/lib/assets/actions";
import { relativeTime, formatSpeedKph, formatAccuracy, coordLabel, formatDateTime } from "@/lib/format";
import type { Alert, AssetDevice, AssetOverview, DeviceProfile, PetProfile, VehicleProfile } from "@/lib/types";
import { cn } from "@/lib/cn";

export type DetailTab = "overview" | "history" | "geofences" | "alerts" | "settings";
const TABS: { key: DetailTab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "history", label: "History" },
  { key: "geofences", label: "Places" },
  { key: "alerts", label: "Alerts" },
  { key: "settings", label: "Settings" },
];

export interface RuleRow {
  id: string;
  rule_type: string;
  params: Record<string, number>;
  channels: string[];
  is_active: boolean;
}

export function AssetDetail({
  initialAsset,
  pet,
  vehicle,
  device,
  devices,
  photoUrl,
  tab,
  rules,
  recentAlerts,
}: {
  initialAsset: AssetOverview;
  pet: PetProfile | null;
  vehicle: VehicleProfile | null;
  device: DeviceProfile | null;
  devices: AssetDevice[];
  photoUrl: string | null;
  tab: DetailTab;
  rules: RuleRow[];
  recentAlerts: Alert[];
}) {
  const { assets, freshnessOf, now, providers, timezone } = useAssetStore();
  const asset = assets[initialAsset.id] ?? initialAsset; // live copy from the store when present
  const freshness = freshnessOf(asset);
  const provider = asset.tracking_provider_key ? providers[asset.tracking_provider_key] : undefined;
  const router = useRouter();

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl p-4 md:p-8">
        <PageHeader
          title={asset.name}
          backHref="/dashboard"
          actions={
            <Link href={`/assets/${asset.id}/edit`} className="inline-flex h-9 items-center gap-1 rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-2">
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Link>
          }
        />
        <div className="mb-4 flex items-center gap-3">
          <AssetIcon type={asset.type} size="lg" photoUrl={photoUrl} />
          <div>
            <p className="text-sm text-muted">
              {TYPE_LABEL[asset.type]}
              {pet?.breed ? ` · ${pet.breed}` : vehicle?.make ? ` · ${[vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(" ")}` : device?.model ? ` · ${device.model}` : ""}
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <FreshnessBadge freshness={freshness} ageLabel={asset.last_location_at ? relativeTime(asset.last_location_at, now) : undefined} />
              {asset.movement_state === "moving" && (freshness === "live" || freshness === "recent") ? <Badge tone="info">{asset.type === "vehicle" ? "Driving" : "Moving"}</Badge> : null}
              {asset.status !== "active" ? <Badge tone="warning">{asset.status}</Badge> : null}
              {!asset.is_tracking_enabled ? <Badge tone="warning">Tracking paused</Badge> : null}
            </div>
          </div>
        </div>

        <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-border" aria-label="Asset sections">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`/assets/${asset.id}${t.key === "overview" ? "" : `?tab=${t.key}`}`}
              className={cn("-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium text-muted hover:text-foreground", tab === t.key ? "border-accent text-accent" : "border-transparent")}
              aria-current={tab === t.key ? "page" : undefined}
            >
              {t.label}
            </Link>
          ))}
        </nav>

        {tab === "overview" ? (
          <div className="grid gap-4 md:grid-cols-5">
            <div className="h-72 overflow-hidden rounded-xl border border-border md:col-span-3 md:h-[420px]">
              <AssetMap assets={[asset]} freshnessOf={freshnessOf} selectedId={asset.id} focusId={asset.id} showControls={false} />
            </div>
            <div className="space-y-3 md:col-span-2">
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <Item label="Current status" value={!asset.last_location_at ? "No location yet" : asset.movement_state === "moving" ? "Moving" : asset.movement_state === "stationary" ? "Stationary" : "Unknown"} />
                <Item label="Location" value={asset.place_label ?? (asset.latitude != null ? "Unnamed area" : "—")} sub={coordLabel(asset.latitude, asset.longitude)} />
                <Item label="Last updated" value={asset.last_location_at ? relativeTime(asset.last_location_at, now) : "—"} sub={asset.last_location_at ? formatDateTime(asset.last_location_at, timezone) : undefined} />
                <Item label="Accuracy" value={asset.last_location_at ? formatAccuracy(asset.accuracy_m) : "—"} />
                {provider?.capabilities.battery ? <Item label="Battery" value={asset.battery_level != null ? `${asset.battery_level}%` : "—"} /> : null}
                {asset.type === "vehicle" ? <Item label="Speed" value={formatSpeedKph(asset.speed_mps)} /> : null}
                {vehicle?.odometer_km != null ? <Item label="Odometer" value={`${Math.round(vehicle.odometer_km).toLocaleString()} km`} /> : null}
                {vehicle?.fuel_level_pct != null ? <Item label="Fuel" value={`${Math.round(vehicle.fuel_level_pct)}%`} /> : null}
                {vehicle?.ignition_on != null ? <Item label="Ignition" value={vehicle.ignition_on ? "On" : "Off"} /> : null}
                <Item label="Source" value={provider?.name ?? "—"} sub={asset.last_source ?? undefined} />
              </dl>
              <div className="flex gap-2">
                <Link href={`/dashboard?asset=${asset.id}`} className="inline-flex h-9 items-center gap-1 rounded-lg bg-accent px-3 text-sm font-medium text-accent-foreground">
                  View on live map
                </Link>
              </div>
              {asset.tracking_provider_key === "manual" || asset.tracking_provider_key === "apple_findmy_reported" ? <ManualCheckIn assetId={asset.id} apple={asset.tracking_provider_key === "apple_findmy_reported"} /> : null}
              {asset.tracking_provider_key === "browser_geolocation" ? <BrowserReporter assetId={asset.id} /> : null}
              {pet ? <ProfileCard title="Pet profile" rows={[["Species", pet.species], ["Breed", pet.breed], ["Sex", pet.sex], ["Born", pet.date_of_birth], ["Microchip", pet.microchip_id], ["Weight", pet.weight_kg != null ? `${pet.weight_kg} kg` : null], ["Emergency contact", [pet.emergency_contact_name, pet.emergency_contact_phone].filter(Boolean).join(" · ") || null], ["Medical notes", pet.medical_notes], ["Notes", pet.notes]]} /> : null}
              {vehicle ? <ProfileCard title="Vehicle profile" rows={[["Make", vehicle.make], ["Model", vehicle.model], ["Year", vehicle.year?.toString() ?? null], ["Registration", vehicle.registration_number], ["VIN", vehicle.vin], ["Colour", vehicle.color], ["Fuel", vehicle.fuel_type], ["Speed alert", vehicle.speed_limit_kph ? `${vehicle.speed_limit_kph} km/h` : null]]} /> : null}
              {device ? <ProfileCard title="Device profile" rows={[["Type", device.device_type], ["Manufacturer", device.manufacturer], ["Model", device.model], ["Serial", device.serial_number], ["OS", [device.os, device.os_version].filter(Boolean).join(" ") || null]]} /> : null}
            </div>
          </div>
        ) : null}

        {tab === "history" ? <HistoryView asset={asset} /> : null}
        {tab === "geofences" ? <GeofenceAssignments assetId={asset.id} /> : null}
        {tab === "alerts" ? <AssetAlerts asset={asset} rules={rules} recentAlerts={recentAlerts} /> : null}
        {tab === "settings" ? <SettingsTab asset={asset} devices={devices} onChanged={() => router.refresh()} /> : null}
      </div>
    </div>
  );
}

function Item({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-2.5">
      <dt className="text-[10px] uppercase tracking-wide text-muted">{label}</dt>
      <dd className="truncate font-medium" title={value}>
        {value}
      </dd>
      {sub ? <dd className="truncate text-[11px] text-muted">{sub}</dd> : null}
    </div>
  );
}

function ProfileCard({ title, rows }: { title: string; rows: [string, string | null | undefined][] }) {
  const filled = rows.filter(([, v]) => v);
  if (filled.length === 0) return null;
  return (
    <dl className="rounded-lg border border-border bg-surface p-3 text-sm">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">{title}</p>
      {filled.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 py-0.5">
          <dt className="text-muted">{k}</dt>
          <dd className="text-right">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function SettingsTab({ asset, devices, onChanged }: { asset: AssetOverview; devices: AssetDevice[]; onChanged: () => void }) {
  const { now } = useAssetStore();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [token, setToken] = useState<{ token: string; providerKey: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const run = (fn: () => Promise<{ error?: string; message?: string; token?: string }>, providerKey?: string) =>
    start(async () => {
      const r = await fn();
      setMsg(r.error ?? r.message ?? null);
      if (r.token && providerKey) setToken({ token: r.token, providerKey });
      onChanged();
    });

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold">Photo</h2>
        <PhotoUpload assetId={asset.id} />
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold">Tracking</h2>
        <p className="text-xs text-muted">Pausing stops new locations from being accepted. History is kept.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => setTrackingEnabled(asset.id, !asset.is_tracking_enabled))}>
            {asset.is_tracking_enabled ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {asset.is_tracking_enabled ? "Pause tracking" : "Resume tracking"}
          </Button>
          {asset.status !== "lost" ? (
            <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => setAssetStatus(asset.id, "lost"))}>
              Mark as lost
            </Button>
          ) : (
            <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => setAssetStatus(asset.id, "active"))}>
              Mark as found
            </Button>
          )}
          {asset.status !== "archived" ? (
            <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => setAssetStatus(asset.id, "archived"))}>
              Archive
            </Button>
          ) : (
            <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => setAssetStatus(asset.id, "active"))}>
              Unarchive
            </Button>
          )}
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold">Tracker devices</h2>
        {devices.length === 0 ? <p className="text-xs text-muted">No tracker devices registered (this source is session-authenticated).</p> : null}
        <ul className="divide-y divide-border">
          {devices.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {d.provider_key} · <span className="font-mono text-xs">{d.external_device_id}</span>
                </p>
                <p className="text-xs text-muted">
                  {d.tracker_model ? `${d.tracker_model} · ` : ""}
                  {d.status} · last sync {d.last_sync_at ? relativeTime(d.last_sync_at, now) : "never"}
                  {d.last_error ? ` · last error: ${d.last_error}` : ""}
                </p>
              </div>
              {["simulated", "traccar", "ios_companion", "flespi", "traccar_client", "owntracks"].includes(d.provider_key) ? (
                <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => rotateDeviceToken(d.id), d.provider_key)}>
                  <RotateCw className="h-3.5 w-3.5" /> Rotate token
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        {token ? <TokenReveal token={token.token} providerKey={token.providerKey} assetId={asset.id} /> : null}
        {asset.tracking_provider_key === "apple_findmy_reported" ? (
          <p className="text-xs text-muted">
            Apple provides no API for AirTag or Find My locations. Use the Find My app for the live view and record check-ins here.{" "}
            <a href="https://support.apple.com/en-us/121488" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-accent hover:underline">
              Share Item Location <ExternalLink className="h-3 w-3" />
            </a>
          </p>
        ) : null}
      </section>

      <section className="space-y-3 rounded-xl border border-danger/40 bg-surface p-4">
        <h2 className="text-sm font-semibold text-danger">Delete asset</h2>
        <p className="text-xs text-muted">The asset disappears immediately and is permanently purged with its history after 30 days.</p>
        {!confirmDelete ? (
          <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="h-3.5 w-3.5" /> Delete…
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="danger" size="sm" disabled={pending} onClick={() => start(() => deleteAsset(asset.id))}>
              Confirm delete
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
          </div>
        )}
      </section>
      {msg ? <p className="text-sm text-muted">{msg}</p> : null}
    </div>
  );
}
