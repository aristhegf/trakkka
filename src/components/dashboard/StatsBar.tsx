"use client";

import { cn } from "@/lib/cn";

export type Section = "all" | "device" | "pet" | "vehicle" | "offline" | "alerts";

export function StatsBar({
  counts,
  section,
  onSection,
}: {
  counts: { total: number; online: number; moving: number; offline: number; openAlerts: number };
  section: Section;
  onSection: (s: Section) => void;
}) {
  const items: { label: string; value: number; key: Section; tone: string }[] = [
    { label: "Assets", value: counts.total, key: "all", tone: "text-foreground" },
    { label: "Online", value: counts.online, key: "all", tone: "text-success" },
    { label: "Moving", value: counts.moving, key: "all", tone: "text-accent" },
    { label: "Offline", value: counts.offline, key: "offline", tone: counts.offline > 0 ? "text-danger" : "text-muted" },
  ];
  return (
    <dl className="grid grid-cols-4 gap-1.5">
      {items.map((it) => (
        <button
          key={it.label}
          type="button"
          onClick={() => onSection(it.key)}
          className={cn("rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-left hover:bg-surface-3", section === it.key && it.key !== "all" && "border-accent")}
        >
          <dt className="text-[10px] uppercase tracking-wide text-muted">{it.label}</dt>
          <dd className={cn("text-lg font-semibold leading-tight tabular-nums", it.tone)}>{it.value}</dd>
        </button>
      ))}
    </dl>
  );
}
