"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Plus } from "lucide-react";
import { useAssetStore } from "@/components/store/AssetStore";
import { setGeofenceAssignment } from "@/lib/geofences/actions";
import { relativeTime } from "@/lib/format";
import { Switch } from "@/components/motion/switch";
import { EmptyState } from "@/components/kit/page";
import { NavButton } from "@/components/kit/nav-button";
import { useToast } from "@/components/kit/toast";

export function GeofenceAssignments({ assetId }: { assetId: string }) {
  const { geofences, now, refresh, assets } = useAssetStore();
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const name = assets[assetId]?.name ?? "this asset";

  const update = (geofenceId: string, opts: { assigned: boolean; notifyOnEnter?: boolean; notifyOnExit?: boolean }) =>
    start(async () => {
      try {
        await setGeofenceAssignment(geofenceId, assetId, opts);
      } catch {
        toast.error("Could not save", "Check your connection and try again.");
      }
      await refresh();
      router.refresh();
    });

  if (geofences.length === 0) {
    return (
      <EmptyState
        icon={<MapPin />}
        title="No places yet"
        body={`Save places like Home, Office or School, then turn on alerts to know when ${name} arrives or leaves.`}
        action={
          <NavButton href="/geofences">
            <Plus /> Add a place
          </NavButton>
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Choose which places to watch for {name}, and whether to get an alert when it arrives or leaves.</p>
      <ul className="grid gap-3 md:grid-cols-2">
        {geofences.map((g) => {
          const link = g.assets.find((l) => l.asset_id === assetId);
          const status = !link ? null : link.is_inside == null ? "Not checked yet" : link.is_inside ? "Inside now" : "Not there";
          return (
            <li key={g.id} className="rounded-3xl border border-border bg-card p-4">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl" style={{ background: `${g.color ?? "#4b3bf0"}22`, color: g.color ?? "#4b3bf0" }}>
                  <MapPin className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{g.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {status ? (
                      <>
                        <span className={link?.is_inside ? "font-medium text-fresh-live" : undefined}>{status}</span>
                        {link?.last_transition_at ? ` · since ${relativeTime(link.last_transition_at, now)}` : ""}
                      </>
                    ) : g.kind === "circle" ? (
                      `Within ${Math.round(g.radius_m ?? 0)} m`
                    ) : (
                      "Drawn area"
                    )}
                  </p>
                </div>
                <Switch checked={Boolean(link)} disabled={pending} ariaLabel={`Watch ${g.name}`} onCheckedChange={(v) => update(g.id, { assigned: v })} />
              </div>
              {link ? (
                <div className="mt-3 space-y-1 rounded-2xl bg-muted/60 px-3.5 py-1">
                  <Row label="Alert when it arrives" checked={link.notify_on_enter} disabled={pending} onChange={(v) => update(g.id, { assigned: true, notifyOnEnter: v, notifyOnExit: link.notify_on_exit })} />
                  <Row label="Alert when it leaves" checked={link.notify_on_exit} disabled={pending} onChange={(v) => update(g.id, { assigned: true, notifyOnEnter: link.notify_on_enter, notifyOnExit: v })} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Row({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <span className="text-sm">{label}</span>
      <Switch checked={checked} disabled={disabled} ariaLabel={label} onCheckedChange={onChange} />
    </div>
  );
}
