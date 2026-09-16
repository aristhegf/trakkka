"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAssetStore } from "@/components/store/AssetStore";
import { setGeofenceAssignment } from "@/lib/geofences/actions";
import { relativeTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

export function GeofenceAssignments({ assetId }: { assetId: string }) {
  const { geofences, now, refresh } = useAssetStore();
  const [pending, start] = useTransition();
  const router = useRouter();
  const update = (geofenceId: string, opts: { assigned: boolean; notifyOnEnter?: boolean; notifyOnExit?: boolean }) =>
    start(async () => {
      await setGeofenceAssignment(geofenceId, assetId, opts);
      await refresh();
      router.refresh();
    });

  if (geofences.length === 0) {
    return (
      <p className="text-sm text-muted">
        No geofences yet.{" "}
        <Link href="/geofences" className="text-accent hover:underline">
          Create one
        </Link>{" "}
        (Home, Office, Vet…) and assign this asset to get enter/exit alerts.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
      {geofences.map((g) => {
        const link = g.assets.find((l) => l.asset_id === assetId);
        return (
          <li key={g.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
            <span className="inline-block h-3 w-3 rounded-full" style={{ background: g.color ?? "#2563eb" }} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {g.name} <span className="text-xs text-muted">· {g.kind === "circle" ? `${Math.round(g.radius_m ?? 0)} m radius` : "polygon"}</span>
              </p>
              {link ? (
                <p className="text-xs text-muted">
                  {link.is_inside == null ? <Badge>Not evaluated yet</Badge> : link.is_inside ? <Badge tone="success">Inside</Badge> : <Badge tone="warning">Outside</Badge>}
                  {link.last_transition_at ? <span className="ml-2">since {relativeTime(link.last_transition_at, now)}</span> : null}
                </p>
              ) : null}
            </div>
            <label className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={Boolean(link)} disabled={pending} onChange={(e) => update(g.id, { assigned: e.target.checked })} /> Assigned
            </label>
            {link ? (
              <>
                <label className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" checked={link.notify_on_enter} disabled={pending} onChange={(e) => update(g.id, { assigned: true, notifyOnEnter: e.target.checked, notifyOnExit: link.notify_on_exit })} /> Alert on enter
                </label>
                <label className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" checked={link.notify_on_exit} disabled={pending} onChange={(e) => update(g.id, { assigned: true, notifyOnEnter: link.notify_on_enter, notifyOnExit: e.target.checked })} /> Alert on exit
                </label>
              </>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
