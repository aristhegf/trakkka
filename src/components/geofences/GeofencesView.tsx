"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownRight, ArrowUpRight, Home, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { useAssetStore } from "@/components/store/AssetStore";
import { GeofenceEditor, PLACE_COLORS, type Draft } from "./GeofenceEditor";
import { deleteGeofence, saveGeofence, setGeofenceAssignment, setHomeGeofence } from "@/lib/geofences/actions";
import { Button } from "@/components/motion/button/base";
import { Switch } from "@/components/motion/switch";
import { Tooltip } from "@/components/motion/tooltip";
import { EmptyState, PageHeader, Section } from "@/components/kit/page";
import { ConfirmDialog } from "@/components/kit/confirm";
import { useActionToast } from "@/components/kit/toast";
import { AssetIcon } from "@/components/assets/AssetIcon";
import { relativeTime, formatDuration, formatDistance } from "@/lib/format";
import { proximity } from "@/lib/geo";
import type { Geofence } from "@/lib/types";
import { cn } from "@/lib/utils";

interface EventRow {
  id: number;
  geofence_id: string;
  asset_id: string;
  event_type: "enter" | "exit";
  occurred_at: string;
  dwell_seconds: number | null;
}

const NEW_DRAFT: Draft = { id: null, name: "", color: PLACE_COLORS[0], address: null, kind: "circle", center: null, radius_m: 200, ring: [] };

export function GeofencesView({ homeGeofenceId, events }: { homeGeofenceId: string | null; events: EventRow[] }) {
  const { geofences, assetList, now, refresh, freshnessOf } = useAssetStore();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<Geofence | null>(null);
  const report = useActionToast();
  const assetName = useMemo(() => Object.fromEntries(assetList.map((a) => [a.id, a.name])), [assetList]);
  const fenceName = useMemo(() => Object.fromEntries(geofences.map((g) => [g.id, g.name])), [geofences]);

  const run = (fn: () => Promise<{ error?: string; message?: string }>, success?: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (report(r, success)) after?.();
      await refresh();
      router.refresh();
    });

  const startEdit = (g: Geofence) =>
    setEditing(
      g.kind === "circle" && g.center
        ? { id: g.id, name: g.name, color: g.color ?? PLACE_COLORS[0], address: g.address, kind: "circle", center: g.center, radius_m: g.radius_m ?? 200, ring: [] }
        : { id: g.id, name: g.name, color: g.color ?? PLACE_COLORS[0], address: g.address, kind: "polygon", center: null, radius_m: 200, ring: g.geometry.coordinates[0].slice(0, -1).map(([lng, lat]) => [lng, lat] as [number, number]) },
    );

  const newPlace = () => setEditing({ ...NEW_DRAFT, name: geofences.length === 0 ? "Home" : "" });

  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      {/* Map: a strip on top on phones (full screen while editing), the right side on desktop. */}
      <div className="relative h-[34vh] shrink-0 border-b border-border md:order-2 md:h-auto md:flex-1 md:border-b-0">
        <GeofenceEditor
          draft={editing}
          onChange={setEditing}
          onCancel={() => setEditing(null)}
          saving={pending}
          onSave={(d) =>
            run(
              () =>
                saveGeofence(
                  d.kind === "circle"
                    ? { kind: "circle", id: d.id, name: d.name, color: d.color, address: d.address, center: d.center!, radius_m: d.radius_m }
                    : { kind: "polygon", id: d.id, name: d.name, color: d.color, address: d.address, ring: d.ring },
                ),
              d.id ? "Place updated" : "Place saved",
              () => setEditing(null),
            )
          }
        />
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto md:order-1 md:w-[420px] md:flex-none md:border-r md:border-border">
        <div className="px-4 pb-28 pt-4 md:px-6 md:pb-10 md:pt-6">
          <PageHeader
            title="Places"
            description="Save the places that matter. See who is there now and get an alert when something arrives or leaves."
            actions={
              <Button onClick={newPlace} className="max-md:h-10 max-md:px-4">
                <Plus className="h-4 w-4" /> Add
              </Button>
            }
          />

          {geofences.length === 0 ? (
            <EmptyState
              icon={<Home />}
              title="Start with Home"
              body="Search your address or use your current location while you are there. Then add others like Office or School."
              action={
                <Button onClick={newPlace}>
                  <Plus className="h-4 w-4" /> Add Home
                </Button>
              }
            />
          ) : (
            <ul className="space-y-3">
              {geofences.map((g) => {
                const isHome = homeGeofenceId === g.id;
                const near = assetList
                  .filter((a) => a.latitude != null && a.longitude != null)
                  .map((a) => ({ asset: a, ...proximity({ lng: a.longitude!, lat: a.latitude! }, g) }))
                  .sort((x, y) => x.distanceM - y.distanceM);
                const insideCount = near.filter((n) => n.inside).length;
                const color = g.color ?? PLACE_COLORS[0];
                return (
                  <li key={g.id} className={cn("rounded-3xl border bg-card p-4", editing?.id === g.id ? "border-primary ring-2 ring-primary/20" : "border-border")}>
                    <div className="flex items-start gap-3">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl" style={{ background: `${color}1f`, color }}>
                        {isHome ? <Home className="h-5 w-5" /> : <MapPin className="h-5 w-5" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 font-semibold">
                          <span className="truncate">{g.name}</span>
                          {isHome ? <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">Home</span> : null}
                        </p>
                        <p className="truncate text-sm text-muted-foreground" title={g.address ?? undefined}>
                          {g.address ?? (g.kind === "circle" ? `Within ${formatDistance(g.radius_m ?? 0)} of a pin` : "Drawn area")}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{insideCount === 0 ? "Nothing here now" : `${insideCount} here now`}</p>
                      </div>
                      <div className="flex shrink-0">
                        <Tooltip content="Edit">
                          <button type="button" onClick={() => startEdit(g)} className="grid h-10 w-10 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Edit ${g.name}`}>
                            <Pencil className="h-4 w-4" />
                          </button>
                        </Tooltip>
                        <Tooltip content="Delete">
                          <button type="button" disabled={pending} onClick={() => setDeleting(g)} className="grid h-10 w-10 place-items-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`Delete ${g.name}`}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </Tooltip>
                      </div>
                    </div>

                    {near.length > 0 ? (
                      <div className="mt-3 rounded-2xl bg-muted/50">
                        <div className="flex items-center justify-between px-3.5 pb-1 pt-2.5 text-xs text-muted-foreground">
                          <span>Distance now</span>
                          <span>Alerts</span>
                        </div>
                        <ul>
                          {near.map(({ asset, distanceM, inside }) => {
                            const link = g.assets.find((l) => l.asset_id === asset.id);
                            const f = freshnessOf(asset);
                            return (
                              <li key={asset.id} className="flex min-h-12 items-center gap-2.5 px-3.5 py-1.5">
                                <AssetIcon type={asset.type} size="sm" />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-medium">{asset.name}</p>
                                  <p className="truncate text-xs text-muted-foreground">
                                    {inside ? <span className="font-medium text-fresh-live">Here</span> : `${formatDistance(distanceM)} away`}
                                    {f === "stale" || f === "offline" || f === "unknown" ? ` · as of ${relativeTime(asset.last_location_at, now)}` : ""}
                                  </p>
                                </div>
                                <Switch
                                  checked={Boolean(link)}
                                  disabled={pending}
                                  ariaLabel={`Alerts for ${asset.name} at ${g.name}`}
                                  onCheckedChange={(v) => run(() => setGeofenceAssignment(g.id, asset.id, { assigned: v }), v ? `Alerts on for ${asset.name}` : `Alerts off for ${asset.name}`)}
                                />
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ) : (
                      <p className="mt-3 rounded-2xl bg-muted/50 px-3.5 py-2.5 text-xs text-muted-foreground">None of your assets has a location yet.</p>
                    )}

                    {!isHome ? (
                      <Button variant="ghost" size="sm" className="-ml-2 mt-2 h-9" disabled={pending} onClick={() => run(() => setHomeGeofence(g.id), `${g.name} is now Home`)}>
                        <Home className="h-3.5 w-3.5" /> Make this Home
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}

          {events.length > 0 ? (
            <Section title="Recent arrivals and departures" className="mt-6">
              <ul className="space-y-1">
                {events.slice(0, 20).map((e) => (
                  <li key={e.id} className="flex items-start gap-3 py-1.5">
                    <span className={cn("mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full", e.event_type === "enter" ? "bg-fresh-live/10 text-fresh-live" : "bg-muted text-muted-foreground")}>
                      {e.event_type === "enter" ? <ArrowDownRight className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                    </span>
                    <div className="min-w-0 flex-1 text-sm">
                      <p>
                        <span className="font-medium">{assetName[e.asset_id] ?? "An asset"}</span> {e.event_type === "enter" ? "arrived at" : "left"} <span className="font-medium">{fenceName[e.geofence_id] ?? "a place"}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {relativeTime(e.occurred_at, now)}
                        {e.dwell_seconds ? ` · stayed ${formatDuration(e.dwell_seconds)}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name ?? "place"}?`}
        body="Its alerts stop and it disappears from the map. Past arrivals and departures are kept."
        pending={pending}
        onConfirm={() => {
          const g = deleting;
          if (!g) return;
          run(() => deleteGeofence(g.id), "Place deleted", () => setDeleting(null));
        }}
      />
    </div>
  );
}
