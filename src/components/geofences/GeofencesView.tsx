"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Home, Plus, Trash2, Pencil } from "lucide-react";
import { useAssetStore } from "@/components/store/AssetStore";
import { GeofenceEditor, type Draft } from "./GeofenceEditor";
import { deleteGeofence, saveGeofence, setGeofenceAssignment, setHomeGeofence } from "@/lib/geofences/actions";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shell/PageHeader";
import { relativeTime, formatDuration } from "@/lib/format";
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
  const { geofences, assetList, now, refresh } = useAssetStore();
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
        ? { id: g.id, name: g.name, color: g.color ?? "#2563eb", kind: "circle", center: g.center, radius_m: g.radius_m ?? 200, ring: [] }
        : { id: g.id, name: g.name, color: g.color ?? "#2563eb", kind: "polygon", center: null, radius_m: 200, ring: g.geometry.coordinates[0].slice(0, -1).map(([lng, lat]) => [lng, lat] as [number, number]) },
    );

  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      <div className="scroll-thin min-h-0 w-full overflow-y-auto border-b border-border bg-surface md:w-[380px] md:border-b-0 md:border-r">
        <div className="p-4">
          <PageHeader
            title="Geofences"
            description="Named areas that raise alerts when an asset enters or leaves."
            actions={
              <Button size="sm" onClick={() => setEditing({ id: null, name: "", color: "#2563eb", kind: "circle", center: null, radius_m: 200, ring: [] })}>
                <Plus className="h-3.5 w-3.5" /> New
              </Button>
            }
          />
          {msg ? <p className="mb-3 text-xs text-muted">{msg}</p> : null}
          <ul className="space-y-2">
            {geofences.length === 0 ? <li className="text-sm text-muted">No geofences yet. Create Home first: pet and vehicle stats use it.</li> : null}
            {geofences.map((g) => (
              <li key={g.id} className={cn("rounded-xl border border-border p-3", editing?.id === g.id && "border-accent")}>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-full" style={{ background: g.color ?? "#2563eb" }} aria-hidden />
                  <span className="flex-1 truncate text-sm font-medium">{g.name}</span>
                  {homeGeofenceId === g.id ? <Home className="h-3.5 w-3.5 text-accent" aria-label="Home" /> : null}
                  <button type="button" onClick={() => startEdit(g)} className="rounded p-1 text-muted hover:bg-surface-2 hover:text-foreground" aria-label={`Edit ${g.name}`}>
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      if (confirm(`Delete geofence "${g.name}"?`)) start(async () => done((await deleteGeofence(g.id)).message));
                    }}
                    className="rounded p-1 text-muted hover:bg-surface-2 hover:text-danger"
                    aria-label={`Delete ${g.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="mt-0.5 text-xs text-muted">{g.kind === "circle" ? `Circle · ${Math.round(g.radius_m ?? 0)} m` : `Polygon · ${g.geometry.coordinates[0].length - 1} points`}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {assetList.map((a) => {
                    const link = g.assets.find((l) => l.asset_id === a.id);
                    return (
                      <button
                        key={a.id}
                        type="button"
                        disabled={pending}
                        onClick={() => start(async () => done((await setGeofenceAssignment(g.id, a.id, { assigned: !link })).message))}
                        className={cn(
                          "rounded-full border px-2 py-0.5 text-[11px]",
                          link ? (link.is_inside ? "border-success/40 bg-success/10 text-success" : "border-accent/40 bg-accent/10 text-accent") : "border-border text-muted hover:bg-surface-2",
                        )}
                        title={link ? (link.is_inside ? "Inside" : link.is_inside === false ? "Outside" : "Assigned") : "Click to assign"}
                      >
                        {a.name}
                        {link?.is_inside ? " ·in" : link?.is_inside === false ? " ·out" : ""}
                      </button>
                    );
                  })}
                </div>
                {homeGeofenceId !== g.id ? (
                  <button type="button" disabled={pending} onClick={() => start(async () => done((await setHomeGeofence(g.id)).message))} className="mt-2 text-[11px] text-accent hover:underline">
                    Set as Home
                  </button>
                ) : null}
              </li>
            ))}
          </ul>

          {events.length > 0 ? (
            <section className="mt-6">
              <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Recent events</h2>
              <ul className="divide-y divide-border rounded-xl border border-border text-xs">
                {events.slice(0, 20).map((e) => (
                  <li key={e.id} className="flex justify-between gap-2 px-3 py-1.5">
                    <span>
                      <span className="font-medium">{assetName[e.asset_id] ?? "Asset"}</span> {e.event_type === "enter" ? "entered" : "left"} <span className="font-medium">{fenceName[e.geofence_id] ?? "geofence"}</span>
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
                  ? { kind: "circle", id: d.id, name: d.name, color: d.color, center: d.center!, radius_m: d.radius_m }
                  : { kind: "polygon", id: d.id, name: d.name, color: d.color, ring: d.ring },
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
