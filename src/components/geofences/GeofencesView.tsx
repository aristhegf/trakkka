"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Home, MapPin, Plus, Trash2, Pencil } from "lucide-react";
import { useAssetStore } from "@/components/store/AssetStore";
import { GeofenceEditor, type Draft } from "./GeofenceEditor";
import { deleteGeofence, saveGeofence, setGeofenceAssignment, setHomeGeofence } from "@/lib/geofences/actions";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shell/PageHeader";
import { relativeTime, formatDuration, formatDistance } from "@/lib/format";
import { proximity } from "@/lib/geo";
import { AssetIcon } from "@/components/assets/AssetIcon";
import type { Geofence } from "@/lib/types";
import { cn } from "@/lib/cn";

interface EventRow {
  id: number;
  geofence_id: string;
  asset_id: string;
  event_type: "enter" | "exit";
  occurred_at: string;
  dwell_seconds: number | null;
}

export function GeofencesView({ homeGeofenceId, events }: { homeGeofenceId: string | null; events: EventRow[] }) {
  const { geofences, assetList, now, refresh, freshnessOf } = useAssetStore();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const assetName = useMemo(() => Object.fromEntries(assetList.map((a) => [a.id, a.name])), [assetList]);
  const fenceName = useMemo(() => Object.fromEntries(geofences.map((g) => [g.id, g.name])), [geofences]);

  const done = async (m?: string) => {
    setMsg(m ?? null);
    await refresh();
    router.refresh();
  };

  const startEdit = (g: Geofence) =>
    setEditing(
      g.kind === "circle" && g.center
        ? { id: g.id, name: g.name, color: g.color ?? "#2563eb", address: g.address, kind: "circle", center: g.center, radius_m: g.radius_m ?? 200, ring: [] }
        : { id: g.id, name: g.name, color: g.color ?? "#2563eb", address: g.address, kind: "polygon", center: null, radius_m: 200, ring: g.geometry.coordinates[0].slice(0, -1).map(([lng, lat]) => [lng, lat] as [number, number]) },
    );

  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      <div className="scroll-thin min-h-0 w-full overflow-y-auto border-b border-border bg-surface md:w-[400px] md:border-b-0 md:border-r">
        <div className="p-4">
          <PageHeader
            title="Places"
            description="Home, office, vet, school… See which assets are at each place and get alerts when they arrive or leave."
            actions={
              <Button size="sm" onClick={() => setEditing({ id: null, name: "", color: "#2563eb", address: null, kind: "circle", center: null, radius_m: 200, ring: [] })}>
                <Plus className="h-3.5 w-3.5" /> New place
              </Button>
            }
          />
          {msg ? <p className="mb-3 text-xs text-muted">{msg}</p> : null}
          <ul className="space-y-3">
            {geofences.length === 0 ? <li className="text-sm text-muted">No places yet. Start with Home: search its address or tap “Use my location” while you are there.</li> : null}
            {geofences.map((g) => {
              const near = assetList
                .filter((a) => a.latitude != null && a.longitude != null)
                .map((a) => ({ asset: a, ...proximity({ lng: a.longitude!, lat: a.latitude! }, g) }))
                .sort((x, y) => x.distanceM - y.distanceM);
              const insideCount = near.filter((n) => n.inside).length;
              return (
                <li key={g.id} className={cn("rounded-xl border border-border p-3", editing?.id === g.id && "border-accent")}>
                  <div className="flex items-start gap-2">
                    <span className="mt-1 inline-block h-3 w-3 shrink-0 rounded-full" style={{ background: g.color ?? "#2563eb" }} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-sm font-medium">
                        <span className="truncate">{g.name}</span>
                        {homeGeofenceId === g.id ? <Home className="h-3.5 w-3.5 shrink-0 text-accent" aria-label="Home" /> : null}
                      </p>
                      <p className="truncate text-xs text-muted" title={g.address ?? undefined}>
                        {g.address ?? (g.center ? `${g.center.lat.toFixed(5)}, ${g.center.lng.toFixed(5)}` : "Drawn on the map")}
                      </p>
                      <p className="text-[11px] text-muted">
                        {g.kind === "circle" ? `${Math.round(g.radius_m ?? 0)} m radius` : `Polygon, ${g.geometry.coordinates[0].length - 1} points`} · {insideCount} {insideCount === 1 ? "asset" : "assets"} here now
                      </p>
                    </div>
                    <button type="button" onClick={() => startEdit(g)} className="rounded p-1 text-muted hover:bg-surface-2 hover:text-foreground" aria-label={`Edit ${g.name}`}>
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        if (confirm(`Delete place "${g.name}"?`)) start(async () => done((await deleteGeofence(g.id)).message));
                      }}
                      className="rounded p-1 text-muted hover:bg-surface-2 hover:text-danger"
                      aria-label={`Delete ${g.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {near.length > 0 ? (
                    <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
                      {near.map(({ asset, distanceM, inside }) => {
                        const link = g.assets.find((l) => l.asset_id === asset.id);
                        const f = freshnessOf(asset);
                        return (
                          <li key={asset.id} className="flex items-center gap-2 px-2 py-1.5 text-xs">
                            <AssetIcon type={asset.type} size="sm" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium">{asset.name}</p>
                              <p className="text-[11px] text-muted">
                                {inside ? "Here" : `${formatDistance(distanceM)} away`}
                                {f === "stale" || f === "offline" ? ` · as of ${relativeTime(asset.last_location_at, now)}` : ""}
                              </p>
                            </div>
                            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", inside ? "bg-success/15 text-success" : "bg-surface-2 text-muted")}>{inside ? "inside" : "outside"}</span>
                            <label className="flex items-center gap-1 text-[11px] text-muted" title="Alert when this asset enters or leaves">
                              <input type="checkbox" checked={Boolean(link)} disabled={pending} onChange={(e) => start(async () => done((await setGeofenceAssignment(g.id, asset.id, { assigned: e.target.checked })).message))} />
                              alerts
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="mt-2 text-[11px] text-muted">No asset has a location yet.</p>
                  )}

                  {homeGeofenceId !== g.id ? (
                    <button type="button" disabled={pending} onClick={() => start(async () => done((await setHomeGeofence(g.id)).message))} className="mt-2 text-[11px] text-accent hover:underline">
                      Set as Home
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {events.length > 0 ? (
            <section className="mt-6">
              <h2 className="mb-2 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted">
                <MapPin className="h-3 w-3" /> Recent arrivals and departures
              </h2>
              <ul className="divide-y divide-border rounded-xl border border-border text-xs">
                {events.slice(0, 20).map((e) => (
                  <li key={e.id} className="flex justify-between gap-2 px-3 py-1.5">
                    <span>
                      <span className="font-medium">{assetName[e.asset_id] ?? "Asset"}</span> {e.event_type === "enter" ? "arrived at" : "left"} <span className="font-medium">{fenceName[e.geofence_id] ?? "place"}</span>
                      {e.dwell_seconds ? <span className="text-muted"> after {formatDuration(e.dwell_seconds)}</span> : null}
                    </span>
                    <span className="shrink-0 text-muted">{relativeTime(e.occurred_at, now)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
      <div className="relative min-h-[360px] flex-1">
        <GeofenceEditor
          draft={editing}
          onChange={setEditing}
          onCancel={() => setEditing(null)}
          onSave={(d) =>
            start(async () => {
              const r = await saveGeofence(
                d.kind === "circle"
                  ? { kind: "circle", id: d.id, name: d.name, color: d.color, address: d.address, center: d.center!, radius_m: d.radius_m }
                  : { kind: "polygon", id: d.id, name: d.name, color: d.color, address: d.address, ring: d.ring },
              );
              if (r.error) setMsg(r.error);
              else {
                setEditing(null);
                await done(r.message);
              }
            })
          }
          saving={pending}
        />
      </div>
    </div>
  );
}
