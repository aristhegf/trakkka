"use client";

import Link from "next/link";
import { AlertOctagon, AlertTriangle, Check, Info } from "lucide-react";
import type { Alert } from "@/lib/types";
import { relativeTime, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAssetStore } from "@/components/store/AssetStore";
import { Button } from "@/components/motion/button/base";

const SEVERITY = {
  info: { icon: Info, cls: "bg-primary/10 text-primary" },
  warning: { icon: AlertTriangle, cls: "bg-fresh-recent/15 text-fresh-recent" },
  critical: { icon: AlertOctagon, cls: "bg-destructive/10 text-destructive" },
} as const;

export function AlertRow({ alert, now, assetName, onAcknowledge, as = "li" }: { alert: Alert; now: Date; assetName?: string; onAcknowledge?: () => void; as?: "li" | "div" }) {
  const { timezone } = useAssetStore();
  const open = !alert.acknowledged_at && !alert.resolved_at;
  const sev = SEVERITY[alert.severity] ?? SEVERITY.info;
  const Icon = sev.icon;
  const Tag = as;
  return (
    <Tag className={cn("flex items-start gap-3 px-4 py-3.5", !open && "opacity-60")}>
      <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-2xl", sev.cls)} aria-hidden>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug">{alert.title}</p>
        {alert.body ? <p className="mt-0.5 text-sm text-muted-foreground">{alert.body}</p> : null}
        <p className="mt-1 text-xs text-muted-foreground">
          {assetName ? (
            <>
              <Link href={`/assets/${alert.asset_id}`} className="font-medium text-foreground hover:underline">
                {assetName}
              </Link>
              {" · "}
            </>
          ) : null}
          <span title={formatDateTime(alert.triggered_at, timezone)}>{relativeTime(alert.triggered_at, now)}</span>
          {alert.resolved_at ? " · resolved" : alert.acknowledged_at ? " · seen" : ""}
        </p>
      </div>
      {onAcknowledge && open ? (
        <Button variant="secondary" size="sm" className="h-11 shrink-0 px-3.5" onClick={onAcknowledge} aria-label={`Mark "${alert.title}" as seen`}>
          <Check className="h-3.5 w-3.5" /> Seen
        </Button>
      ) : null}
    </Tag>
  );
}
