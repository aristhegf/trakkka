"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { relativeTime } from "@/lib/format";

/**
 * Reports this browser's own position for a device asset while the page is open (foreground only:
 * the Geolocation API has no background mode). Sharing is off by default and must be started
 * explicitly on every visit; nothing is persisted.
 */
export function BrowserReporter({ assetId }: { assetId: string }) {
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<string>("Waiting for a fix…");
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
            setStatus(`Reporting (±${Math.round(c.accuracy)} m)`);
          } else {
            setStatus(`Server refused (${res.status})`);
          }
        } catch {
          setStatus("Network error; will retry on the next fix.");
        }
      },
      (err) => setStatus(err.code === err.PERMISSION_DENIED ? "Permission denied. Allow location for this site to continue." : `Error: ${err.message}`),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [enabled, assetId]);

  const supported = typeof navigator !== "undefined" && "geolocation" in navigator;
  const shownStatus = !enabled ? "Off" : !supported ? "Geolocation is not available in this browser." : status;

  return (
    <div className="space-y-2 rounded-lg border border-border bg-surface p-3">
      <p className="text-sm font-semibold">Report this browser&apos;s location</p>
      <p className="text-xs text-muted">Works only while AssetWatch is open in this tab. Browsers do not allow background location for websites; the iOS companion app is the path for that.</p>
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          variant={enabled ? "danger" : "primary"}
          onClick={() => {
            setStatus("Waiting for a fix…");
            setEnabled((e) => !e);
          }}
        >
          {enabled ? "Stop sharing" : "Start sharing"}
        </Button>
        <span className="text-xs text-muted">
          {shownStatus}
          {enabled && lastSent ? ` · last sent ${relativeTime(lastSent)}` : ""}
        </span>
      </div>
    </div>
  );
}
