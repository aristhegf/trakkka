"use client";

import { useActionState, useEffect, useState } from "react";
import { LocateFixed } from "lucide-react";
import { reportManualLocation, type ActionResult } from "@/lib/assets/actions";
import { Button } from "@/components/motion/button/base";
import { Input } from "@/components/motion/input";
import { Section } from "@/components/kit/page";
import { useActionToast, useToast } from "@/components/kit/toast";

export function ManualCheckIn({ assetId, apple }: { assetId: string; apple: boolean }) {
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(reportManualLocation, undefined);
  const [coords, setCoords] = useState({ lat: "", lng: "" });
  const [locating, setLocating] = useState(false);
  const report = useActionToast();
  const toast = useToast();

  useEffect(() => {
    report(state, "Location saved");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const useMyPosition = () => {
    if (!navigator.geolocation) {
      toast.error("Location is not available in this browser");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        setCoords({ lat: p.coords.latitude.toFixed(6), lng: p.coords.longitude.toFixed(6) });
      },
      () => {
        setLocating(false);
        toast.error("Could not get your position", "Allow location for this site and try again.");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return (
    <Section
      title={apple ? "Record a Find My check-in" : "Record a location"}
      description={apple ? "Open Find My, read where the item is, and enter it here. It is labelled as a check-in, never as live." : "Enter where it is now, or use your own position if you are next to it."}
    >
      <form action={action} className="space-y-4">
        <input type="hidden" name="assetId" value={assetId} />
        <Button type="button" variant="secondary" className="w-full" disabled={locating} onClick={useMyPosition}>
          <LocateFixed className="h-4 w-4" /> {locating ? "Finding you…" : "Use my current position"}
        </Button>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Latitude" name="latitude" required inputMode="decimal" value={coords.lat} onChange={(v) => setCoords((c) => ({ ...c, lat: v }))} placeholder="6.4474" />
          <Input label="Longitude" name="longitude" required inputMode="decimal" value={coords.lng} onChange={(v) => setCoords((c) => ({ ...c, lng: v }))} placeholder="3.4219" />
        </div>
        <Input label="When (leave blank for now)" name="recordedAt" type="datetime-local" />
        <Input label="Note" name="note" maxLength={200} placeholder="Seen near the vet" />
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Saving…" : "Save location"}
        </Button>
      </form>
    </Section>
  );
}
