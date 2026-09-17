"use client";

import { RotateCw, WifiOff } from "lucide-react";
import { useAssetStore } from "@/components/store/AssetStore";
import { cn } from "@/lib/utils";

/** Grace period so the normal connect on page load, or a brief blip, never flashes a warning. */
const GRACE_MS = 5000;

/**
 * Tells phone users when the map may be out of date: the device is offline, or the live-updates channel has been
 * down for a few seconds. Renders nothing while everything is connected.
 */
export function ConnectionBanner({ className }: { className?: string }) {
  const { connected, connectionChangedAt, online, now, reconnect } = useAssetStore();
  const down = !connected && now.getTime() - connectionChangedAt > GRACE_MS;
  if (online && !down) return null;

  return (
    <div role="status" className={cn("flex min-h-11 items-center gap-2.5 rounded-full border border-border bg-card/95 pl-3.5 pr-1 text-sm shadow-lg backdrop-blur", className)}>
      {online ? <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-fresh-recent" aria-hidden /> : <WifiOff className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
      <span className="min-w-0 flex-1 truncate">{online ? "Live updates paused" : "Offline. Showing last known locations."}</span>
      {online ? (
        <button type="button" onClick={reconnect} className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 font-medium text-primary hover:bg-primary/10 active:bg-primary/15">
          <RotateCw className="h-3.5 w-3.5" /> Retry
        </button>
      ) : null}
    </div>
  );
}
