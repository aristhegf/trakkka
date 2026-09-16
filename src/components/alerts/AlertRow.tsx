"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import type { Alert } from "@/lib/types";
import { relativeTime, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/cn";

const SEVERITY_DOT = { info: "bg-accent", warning: "bg-warning", critical: "bg-danger" } as const;

export function AlertRow({ alert, now, assetName, onAcknowledge }: { alert: Alert; now: Date; assetName?: string; onAcknowledge?: () => void }) {
  const open = !alert.acknowledged_at && !alert.resolved_at;
  return (
    <li className={cn("flex items-start gap-3 p-3 text-sm", !open && "opacity-70")}>
      <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", SEVERITY_DOT[alert.severity])} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{alert.title}</p>
        <p className="text-xs text-muted">
          {assetName ? (
            <>
              <Link href={`/assets/${alert.asset_id}`} className="hover:underline">
                {assetName}
              </Link>{" "}
              ·{" "}
            </>
          ) : null}
          <span title={formatDateTime(alert.triggered_at)}>{relativeTime(alert.triggered_at, now)}</span>
          {alert.resolved_at ? " · resolved" : alert.acknowledged_at ? " · acknowledged" : ""}
        </p>
        {alert.body ? <p className="mt-0.5 text-xs text-muted">{alert.body}</p> : null}
      </div>
      {onAcknowledge && open ? (
        <button type="button" onClick={onAcknowledge} className="shrink-0 rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-foreground" aria-label="Acknowledge">
          <Check className="h-4 w-4" />
        </button>
      ) : null}
    </li>
  );
}
