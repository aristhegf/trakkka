"use client";

import { useActionState, useState } from "react";
import { LocateFixed } from "lucide-react";
import { reportManualLocation, type ActionResult } from "@/lib/assets/actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

export function ManualCheckIn({ assetId, apple }: { assetId: string; apple: boolean }) {
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(reportManualLocation, undefined);
  const [coords, setCoords] = useState({ lat: "", lng: "" });
  const useMyPosition = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((p) => setCoords({ lat: p.coords.latitude.toFixed(6), lng: p.coords.longitude.toFixed(6) }), () => undefined, { enableHighAccuracy: true, timeout: 10000 });
  };
  return (
    <form action={action} className="space-y-3 rounded-lg border border-border bg-surface p-3">
      <input type="hidden" name="assetId" value={assetId} />
      <p className="text-sm font-semibold">{apple ? "Record a Find My check-in" : "Record a location"}</p>
      {apple ? <p className="text-xs text-muted">Open Find My, read the item&apos;s location, and enter it here. It will be labelled as a manual check-in, never as live.</p> : null}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Latitude">
          <Input name="latitude" required inputMode="decimal" value={coords.lat} onChange={(e) => setCoords((c) => ({ ...c, lat: e.target.value }))} placeholder="6.4474" />
        </Field>
        <Field label="Longitude">
          <Input name="longitude" required inputMode="decimal" value={coords.lng} onChange={(e) => setCoords((c) => ({ ...c, lng: e.target.value }))} placeholder="3.4219" />
        </Field>
      </div>
      <Field label="When" hint="Leave blank for now.">
        <Input name="recordedAt" type="datetime-local" />
      </Field>
      <Field label="Note">
        <Input name="note" maxLength={200} placeholder="Seen near the vet" />
      </Field>
      {state?.error ? <p className="text-xs text-danger">{state.error}</p> : null}
      {state?.message ? <p className="text-xs text-success">{state.message}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save location"}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={useMyPosition}>
          <LocateFixed className="h-3.5 w-3.5" /> Use my position
        </Button>
      </div>
    </form>
  );
}
