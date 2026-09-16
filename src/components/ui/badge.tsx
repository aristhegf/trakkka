import { cn } from "@/lib/cn";
import type { Freshness } from "@/lib/types";
import { FRESHNESS_LABEL } from "@/lib/freshness";

export function Badge({ children, className, tone = "neutral" }: { children: React.ReactNode; className?: string; tone?: "neutral" | "success" | "warning" | "danger" | "info" }) {
  const tones = {
    neutral: "bg-surface-2 text-muted border-border",
    success: "bg-success/15 text-success border-success/30",
    warning: "bg-warning/15 text-warning border-warning/30",
    danger: "bg-danger/15 text-danger border-danger/30",
    info: "bg-accent/15 text-accent border-accent/30",
  };
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4", tones[tone], className)}>
      {children}
    </span>
  );
}

const FRESHNESS_TONE: Record<Freshness, "success" | "warning" | "danger" | "neutral"> = {
  live: "success",
  recent: "warning",
  stale: "warning",
  offline: "danger",
  unknown: "neutral",
};

export function FreshnessBadge({ freshness, ageLabel }: { freshness: Freshness; ageLabel?: string }) {
  return (
    <Badge tone={FRESHNESS_TONE[freshness]}>
      <span className={cn("inline-block h-1.5 w-1.5 rounded-full", `bg-fresh-${freshness}`)} aria-hidden />
      {FRESHNESS_LABEL[freshness]}
      {ageLabel ? <span className="opacity-70">· {ageLabel}</span> : null}
    </Badge>
  );
}
