"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Archive, Clock, Crosshair, ExternalLink, Map as MapIcon, MapPin, Navigation, Pencil, RotateCw, SearchCheck, Siren, Trash2 } from "lucide-react";
import { useAssetStore } from "@/components/store/AssetStore";
import { AssetMap } from "@/components/map/AssetMap";
import { AssetIcon, TYPE_LABEL } from "./AssetIcon";
import { HistoryView } from "./HistoryView";
import { ManualCheckIn } from "./ManualCheckIn";
import { BrowserReporter } from "./BrowserReporter";
import { GeofenceAssignments } from "./GeofenceAssignments";
import { AssetAlerts } from "./AssetAlerts";
import { PhotoUpload } from "./PhotoUpload";
import { TokenReveal } from "./TokenReveal";
import { Battery } from "@/components/dashboard/AssetRow";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import { Switch } from "@/components/motion/switch";
import { Button, ButtonLink } from "@/components/motion/button/base";
import { BouncyAccordion } from "@/components/motion/bouncy-accordion";
import { FreshnessBadge } from "@/components/kit/status";
import { Fact, Page, PageHeader, Section } from "@/components/kit/page";
import { NavButton } from "@/components/kit/nav-button";
import { ConfirmDialog } from "@/components/kit/confirm";
import { useActionToast } from "@/components/kit/toast";
import { deleteAsset, rotateDeviceToken, setAssetStatus, setTrackingEnabled } from "@/lib/assets/actions";
import { FRESHNESS_HELP, coordinates, describeAccuracy, describeMovement, describeWhere, directionsUrl } from "@/lib/describe";
import { formatDateTime, formatSpeedKph, relativeTime } from "@/lib/format";
import type { Alert, AssetDevice, AssetOverview, DeviceProfile, PetProfile, VehicleProfile } from "@/lib/types";

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
  const { assets, freshnessOf, providers } = useAssetStore();
  const asset = assets[initialAsset.id] ?? initialAsset; // live copy from the store when present
  const freshness = freshnessOf(asset);
  const provider = asset.tracking_provider_key ? providers[asset.tracking_provider_key] : undefined;
  const router = useRouter();

  // The tab lives in the URL (shareable, back button works). Show the picked tab immediately while the URL catches up;
  // a tab change from elsewhere (a link) resets it because it is keyed to the tab it was picked from.
  const [picked, setPicked] = useState<{ value: DetailTab; from: DetailTab } | null>(null);
  const current = picked && picked.from === tab ? picked.value : tab;
  const selectTab = (v: string) => {
    const next = v as DetailTab;
    setPicked({ value: next, from: tab });
    router.replace(`/assets/${asset.id}${next === "overview" ? "" : `?tab=${next}`}`, { scroll: false });
  };

  const subtitle = [TYPE_LABEL[asset.type], pet?.breed, vehicle?.make ? [vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(" ") : null, device?.model, provider ? `via ${provider.name}` : null].filter(Boolean).join(" · ");

  return (
    <Page wide>
      <PageHeader
        title={asset.name}
        backHref="/dashboard"
        backLabel="Map"
        actions={
          <NavButton href={`/assets/${asset.id}/edit`} variant="secondary" size="sm" className="h-11 px-4">
            <Pencil /> Edit
          </NavButton>
        }
      />

      <div className="-mt-3 mb-5 flex items-center gap-3">
        <AssetIcon type={asset.type} size="lg" photoUrl={photoUrl} />
        <div className="min-w-0">
          <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <FreshnessBadge freshness={freshness} size="md" explain />
            {asset.status === "lost" ? <Chip tone="danger">Marked lost</Chip> : null}
            {asset.status === "archived" ? <Chip>Archived</Chip> : null}
            {!asset.is_tracking_enabled ? <Chip tone="warning">Tracking paused</Chip> : null}
          </div>
        </div>
      </div>

      <Tabs value={current} onValueChange={selectTab} variant="underline" className="no-scrollbar -mx-4 mb-5 overflow-x-auto px-4 md:mx-0 md:px-0">
        <TabsList className="w-full min-w-max">
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {current === "overview" ? <Overview asset={asset} pet={pet} vehicle={vehicle} device={device} /> : null}
      {current === "history" ? <HistoryView asset={asset} /> : null}
      {current === "geofences" ? <GeofenceAssignments assetId={asset.id} /> : null}
      {current === "alerts" ? <AssetAlerts asset={asset} rules={rules} recentAlerts={recentAlerts} /> : null}
      {current === "settings" ? <SettingsTab asset={asset} devices={devices} onChanged={() => router.refresh()} /> : null}
    </Page>
  );
}

function Chip({ children, tone }: { children: React.ReactNode; tone?: "danger" | "warning" }) {
  const cls = tone === "danger" ? "border-destructive/30 bg-destructive/10 text-destructive" : tone === "warning" ? "border-fresh-recent/30 bg-fresh-recent/10 text-fresh-recent" : "border-border bg-muted text-muted-foreground";
  return <span className={`inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-medium ${cls}`}>{children}</span>;
}

function Overview({ asset, pet, vehicle, device }: { asset: AssetOverview; pet: PetProfile | null; vehicle: VehicleProfile | null; device: DeviceProfile | null }) {
  const { freshnessOf, geofences, now, providers, timezone } = useAssetStore();
  const freshness = freshnessOf(asset);
  const provider = asset.tracking_provider_key ? providers[asset.tracking_provider_key] : undefined;
  const where = describeWhere(asset, geofences);
  const movement = describeMovement(asset, freshness);
  const accuracy = describeAccuracy(asset.accuracy_m);
  const live = freshness === "live" || freshness === "recent";

  return (
    <div className="grid gap-4 md:grid-cols-5">
      <div className="space-y-4 md:col-span-3">
        <div className="relative h-64 overflow-hidden rounded-3xl border border-border md:h-[420px]">
          <AssetMap assets={[asset]} freshnessOf={freshnessOf} selectedId={asset.id} focusId={asset.id} controls="none" />
          <NavButton href={`/dashboard?asset=${asset.id}`} variant="secondary" size="sm" className="absolute right-3 top-3 z-10 h-11 px-4 shadow-md">
            <MapIcon /> Open live map
          </NavButton>
        </div>
        {asset.tracking_provider_key === "manual" || asset.tracking_provider_key === "apple_findmy_reported" ? <ManualCheckIn assetId={asset.id} apple={asset.tracking_provider_key === "apple_findmy_reported"} /> : null}
        {asset.tracking_provider_key === "browser_geolocation" ? <BrowserReporter assetId={asset.id} /> : null}
      </div>

      <div className="space-y-4 md:col-span-2">
        <Section>
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" /> {live ? "Where it is" : "Last seen"}
          </p>
          <p className="mt-1 text-lg font-semibold leading-snug">{where.title}</p>
          {where.detail ? <p className="text-sm text-muted-foreground">{where.detail}</p> : null}
          {where.hasLocation ? (
            <div className="mt-3 space-y-1 text-sm text-muted-foreground">
              <p className="flex items-center gap-2">
                <Clock className="h-4 w-4 shrink-0" /> Updated {relativeTime(asset.last_location_at, now)}
              </p>
              {accuracy ? (
                <p className="flex items-center gap-2">
                  <Crosshair className="h-4 w-4 shrink-0" /> {accuracy}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">{FRESHNESS_HELP.unknown}</p>
          )}
          {where.hasLocation ? (
            <ButtonLink href={directionsUrl(asset.latitude!, asset.longitude!)} target="_blank" rel="noreferrer" variant="secondary" className="mt-4 w-full">
              <Navigation className="h-4 w-4" /> Directions
            </ButtonLink>
          ) : null}
        </Section>

        <div className="grid grid-cols-2 gap-2">
          <Fact label="Movement" value={movement ?? "Unknown"} />
          {provider?.capabilities.battery ? <Fact label="Battery" value={asset.battery_level != null ? <Battery level={asset.battery_level} /> : "Unknown"} /> : null}
          {asset.type === "vehicle" ? <Fact label="Speed" value={live ? formatSpeedKph(asset.speed_mps) : "—"} /> : null}
          {vehicle?.odometer_km != null ? <Fact label="Odometer" value={`${Math.round(vehicle.odometer_km).toLocaleString()} km`} /> : null}
          {vehicle?.fuel_level_pct != null ? <Fact label="Fuel" value={`${Math.round(vehicle.fuel_level_pct)}%`} /> : null}
          {vehicle?.ignition_on != null ? <Fact label="Ignition" value={vehicle.ignition_on ? "On" : "Off"} /> : null}
          <Fact label="Last report" value={asset.last_received_at ? relativeTime(asset.last_received_at, now) : "Never"} />
          <Fact label="Tracking with" value={provider?.name ?? "—"} />
        </div>

        {pet ? <Profile title="Pet" rows={[["Species", pet.species], ["Breed", pet.breed], ["Sex", pet.sex], ["Born", pet.date_of_birth], ["Microchip", pet.microchip_id], ["Weight", pet.weight_kg != null ? `${pet.weight_kg} kg` : null], ["Emergency contact", [pet.emergency_contact_name, pet.emergency_contact_phone].filter(Boolean).join(" · ") || null], ["Medical notes", pet.medical_notes], ["Notes", pet.notes]]} /> : null}
        {vehicle ? <Profile title="Vehicle" rows={[["Make", vehicle.make], ["Model", vehicle.model], ["Year", vehicle.year?.toString() ?? null], ["Plate", vehicle.registration_number], ["VIN", vehicle.vin], ["Colour", vehicle.color], ["Fuel", vehicle.fuel_type], ["Speed alert", vehicle.speed_limit_kph ? `${vehicle.speed_limit_kph} km/h` : null]]} /> : null}
        {device ? <Profile title="Device" rows={[["Kind", device.device_type], ["Manufacturer", device.manufacturer], ["Model", device.model], ["Serial", device.serial_number], ["OS", [device.os, device.os_version].filter(Boolean).join(" ") || null]]} /> : null}

        {where.hasLocation ? (
          <BouncyAccordion
            collapsible
            items={[
              {
                id: "tech",
                title: <span className="text-sm">Technical details</span>,
                description: (
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
                    <dt className="text-muted-foreground">Coordinates</dt>
                    <dd className="font-mono">{coordinates(asset.latitude!, asset.longitude!)}</dd>
                    <dt className="text-muted-foreground">Accuracy</dt>
                    <dd>{asset.accuracy_m != null ? `±${Math.round(asset.accuracy_m)} m` : "Not reported"}</dd>
                    <dt className="text-muted-foreground">Recorded</dt>
                    <dd>{formatDateTime(asset.last_location_at, timezone)}</dd>
                    <dt className="text-muted-foreground">Source</dt>
                    <dd className="font-mono">{asset.last_source ?? "—"}</dd>
                  </dl>
                ),
              },
            ]}
          />
        ) : null}
      </div>
    </div>
  );
}

function Profile({ title, rows }: { title: string; rows: [string, string | null | undefined][] }) {
  const filled = rows.filter(([, v]) => v);
  if (filled.length === 0) return null;
  return (
    <Section title={title}>
      <dl className="divide-y divide-border text-sm">
        {filled.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 py-2 first:pt-0 last:pb-0">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="text-right font-medium first-letter:uppercase">{v}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

const ROTATABLE = ["simulated", "traccar", "ios_companion", "flespi", "traccar_client", "owntracks"];

function SettingsTab({ asset, devices, onChanged }: { asset: AssetOverview; devices: AssetDevice[]; onChanged: () => void }) {
  const { now, providers } = useAssetStore();
  const [pending, start] = useTransition();
  const [token, setToken] = useState<{ token: string; providerKey: string } | null>(null);
  const [confirm, setConfirm] = useState<null | "delete" | { rotate: AssetDevice }>(null);
  const report = useActionToast();

  const run = (fn: () => Promise<{ error?: string; message?: string; token?: string }>, success: string, providerKey?: string) =>
    start(async () => {
      const r = await fn();
      if (report(r, success) && r.token && providerKey) setToken({ token: r.token, providerKey });
      onChanged();
    });

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-4">
        <Section title="Tracking">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Accept new locations</p>
              <p className="text-xs text-muted-foreground">Turn off to pause. History is kept.</p>
            </div>
            <Switch
              checked={asset.is_tracking_enabled}
              disabled={pending}
              ariaLabel="Accept new locations"
              onCheckedChange={(v) => run(() => setTrackingEnabled(asset.id, v), v ? "Tracking resumed" : "Tracking paused")}
            />
          </div>
        </Section>

        <Section title="Status" description="Mark it as lost while it is missing. Archive it when you stop tracking it.">
          <div className="flex flex-wrap gap-2">
            {asset.status !== "lost" ? (
              <Button variant="secondary" disabled={pending} onClick={() => run(() => setAssetStatus(asset.id, "lost"), "Marked as lost")}>
                <Siren className="h-4 w-4" /> Mark as lost
              </Button>
            ) : (
              <Button variant="secondary" disabled={pending} onClick={() => run(() => setAssetStatus(asset.id, "active"), "Marked as found")}>
                <SearchCheck className="h-4 w-4" /> Mark as found
              </Button>
            )}
            {asset.status !== "archived" ? (
              <Button variant="secondary" disabled={pending} onClick={() => run(() => setAssetStatus(asset.id, "archived"), "Archived")}>
                <Archive className="h-4 w-4" /> Archive
              </Button>
            ) : (
              <Button variant="secondary" disabled={pending} onClick={() => run(() => setAssetStatus(asset.id, "active"), "Restored")}>
                <Archive className="h-4 w-4" /> Unarchive
              </Button>
            )}
          </div>
        </Section>

        <Section title="Photo">
          <PhotoUpload assetId={asset.id} />
        </Section>
      </div>

      <div className="space-y-4">
        <Section title="Connected trackers" description="The app or device that sends this asset's location.">
          {devices.length === 0 ? <p className="text-sm text-muted-foreground">Nothing to connect. This method reports through your signed-in browser.</p> : null}
          <ul className="space-y-2">
            {devices.map((d) => (
              <li key={d.id} className="rounded-2xl bg-muted/60 p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{providers[d.provider_key as keyof typeof providers]?.name ?? d.provider_key}</p>
                    <p className="text-xs text-muted-foreground">
                      {d.status === "active" ? "Connected" : d.status} · last heard {d.last_sync_at ? relativeTime(d.last_sync_at, now) : "never"}
                      {d.tracker_model ? ` · ${d.tracker_model}` : ""}
                    </p>
                    {d.last_error ? <p className="mt-1 text-xs text-destructive">Last error: {d.last_error}</p> : null}
                  </div>
                  {ROTATABLE.includes(d.provider_key) ? (
                    <Button variant="secondary" size="sm" className="h-11 shrink-0" disabled={pending} onClick={() => setConfirm({ rotate: d })}>
                      <RotateCw className="h-3.5 w-3.5" /> New details
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          {asset.tracking_provider_key === "apple_findmy_reported" ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Apple has no API for AirTag or Find My locations. Use Find My for the live view and record check-ins here.{" "}
              <a href="https://support.apple.com/en-us/121488" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:underline">
                Share Item Location <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          ) : null}
        </Section>
        {token ? <TokenReveal token={token.token} providerKey={token.providerKey} assetId={asset.id} /> : null}

        <Section title="Delete" className="border-destructive/30" description="It disappears now and is permanently erased with its history after 30 days.">
          <Button variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10" onClick={() => setConfirm("delete")}>
            <Trash2 className="h-4 w-4" /> Delete {asset.name}
          </Button>
        </Section>
      </div>

      <ConfirmDialog
        open={confirm === "delete"}
        onClose={() => setConfirm(null)}
        title={`Delete ${asset.name}?`}
        body="Its location history, places and alerts go with it. You cannot undo this after 30 days."
        confirmLabel="Delete"
        pending={pending}
        onConfirm={() =>
          start(async () => {
            await deleteAsset(asset.id);
          })
        }
      />
      <ConfirmDialog
        open={typeof confirm === "object" && confirm !== null}
        onClose={() => setConfirm(null)}
        title="Make new connection details?"
        body="The tracker or phone app stops reporting until you paste the new details into it."
        confirmLabel="Make new details"
        pending={pending}
        onConfirm={() => {
          if (typeof confirm !== "object" || !confirm) return;
          const d = confirm.rotate;
          setConfirm(null);
          run(() => rotateDeviceToken(d.id), "New details ready", d.provider_key);
        }}
      />
    </div>
  );
}
