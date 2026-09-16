"use client";

import { useEffect, useState } from "react";
import { Switch } from "@/components/motion/switch";
import { Section } from "@/components/kit/page";
import { relativeTime } from "@/lib/format";

/**
 * Reports this browser's own position for a device asset while the page is open (foreground only:
 * the Geolocation API has no background mode). Sharing is off by default and must be started
 * explicitly on every visit; nothing is persisted.
 */
export function BrowserReporter({ assetId }: { assetId: string }) {
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<string>("Waiting for your position…");
  const [ok, setOk] = useState(true);
  const [lastSent, setLastSent] = useState<Date | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (!navigator.geolocation) return;
    let lastPost = 0;
    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        // Throttle to one report every 10 s; the server samples further.
        if (Date.now() - lastPost < 10_000) return;
        lastPost = Date.now();
        const c = pos.coords;
        const body = {
          assetId,
          recordedAt: new Date(pos.timestamp).toISOString(),
          latitude: c.latitude,
          longitude: c.longitude,
          accuracyM: c.accuracy ?? null,
          altitudeM: c.altitude ?? null,
          speedMps: c.speed != null && c.speed >= 0 ? c.speed : null,
          headingDeg: c.heading != null && !Number.isNaN(c.heading) ? c.heading : null,
          providerEventId: String(pos.timestamp),
        };
        try {
          const res = await fetch("/api/ingest/browser_geolocation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
          if (res.ok) {
            setLastSent(new Date());
            setOk(true);
            setStatus(`Sharing, accurate to about ${Math.round(c.accuracy)} m`);
          } else {
            setOk(false);
            setStatus(`The server refused the location (${res.status}).`);
          }
        } catch {
          setOk(false);
          setStatus("No connection. Trying again on the next update.");
        }
      },
      (err) => {
        setOk(false);
        setStatus(err.code === err.PERMISSION_DENIED ? "Location permission is blocked. Allow it for this site to share." : `Could not get a position: ${err.message}`);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [enabled, assetId]);

  const supported = typeof navigator !== "undefined" && "geolocation" in navigator;
  const shownStatus = !enabled ? "Off" : !supported ? "Location is not available in this browser." : status;

  return (
    <Section title="Share this browser's location" description="Works only while Trakkka stays open in this tab. For background tracking use a phone app instead.">
      <div className="flex items-center justify-between gap-4 rounded-2xl bg-muted/60 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{enabled ? "Sharing is on" : "Sharing is off"}</p>
          <p className={enabled && !ok ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
            {shownStatus}
            {enabled && lastSent ? ` · sent ${relativeTime(lastSent)}` : ""}
          </p>
        </div>
        <Switch
          checked={enabled}
          ariaLabel="Share this browser's location"
          onCheckedChange={(v) => {
            setStatus("Waiting for your position…");
            setOk(true);
            setEnabled(v);
          }}
        />
      </div>
    </Section>
  );
}
