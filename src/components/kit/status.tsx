"use client";

import { AlertTriangle, CircleDashed, Clock, Radio, WifiOff } from "lucide-react";
import { AnimatedBadge } from "@/components/motion/animated-badge";
import { Tooltip } from "@/components/motion/tooltip";
import type { Freshness } from "@/lib/types";
import { FRESHNESS_HELP } from "@/lib/describe";
import { cn } from "@/lib/utils";

const LABEL: Record<Freshness, string> = {
  live: "Live",
  recent: "Recent",
  stale: "Stale",
  offline: "Offline",
  unknown: "No location",
};

const ICON: Record<Freshness, React.ReactNode> = {
  live: <Radio />,
  recent: <Clock />,
  stale: <AlertTriangle />,
  offline: <WifiOff />,
  unknown: <CircleDashed />,
};

/** Colours come from the same --fresh-* tokens as the marker rings on the map. */
const TONE: Record<Freshness, string> = {
  live: "border-fresh-live/30 bg-fresh-live/10 text-fresh-live",
  recent: "border-fresh-recent/30 bg-fresh-recent/10 text-fresh-recent",
  stale: "border-fresh-stale/30 bg-fresh-stale/10 text-fresh-stale",
  offline: "border-fresh-offline/30 bg-fresh-offline/10 text-fresh-offline",
  unknown: "border-border bg-muted text-muted-foreground",
};

/** Labelled freshness badge (beui Animated Badge). Always says the state in words, never colour alone. */
export function FreshnessBadge({ freshness, size = "sm", explain = false, className }: { freshness: Freshness; size?: "sm" | "md"; explain?: boolean; className?: string }) {
  const badge = (
    <AnimatedBadge
      size={size}
      status="neutral"
      icon={ICON[freshness]}
      pulse={freshness === "live"}
      contentKey={freshness}
      className={cn("font-medium", TONE[freshness], className)}
    >
      {LABEL[freshness]}
    </AnimatedBadge>
  );
  if (!explain) return badge;
  return (
    <Tooltip content={<span className="block max-w-56 text-xs leading-snug">{FRESHNESS_HELP[freshness]}</span>} side="bottom">
      <span tabIndex={0} className="inline-flex cursor-help rounded-full outline-none">
        {badge}
      </span>
    </Tooltip>
  );
}

export const FRESHNESS_DOT: Record<Freshness, string> = {
  live: "bg-fresh-live",
  recent: "bg-fresh-recent",
  stale: "bg-fresh-stale",
  offline: "bg-fresh-offline",
  unknown: "bg-fresh-unknown",
};
