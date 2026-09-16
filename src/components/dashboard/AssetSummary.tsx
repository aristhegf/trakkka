"use client";

import Link from "next/link";
import { ArrowUpRight, ChevronRight, Clock, Crosshair, MapPin, Navigation, X } from "lucide-react";
import type { AssetOverview, Freshness } from "@/lib/types";
import { AssetIcon, TYPE_LABEL } from "@/components/assets/AssetIcon";
import { FreshnessBadge } from "@/components/kit/status";
import { Fact } from "@/components/kit/page";
import { ButtonLink } from "@/components/motion/button/base";
import { BouncyAccordion } from "@/components/motion/bouncy-accordion";
import { useAssetStore } from "@/components/store/AssetStore";
import { Battery } from "./AssetRow";
import { FRESHNESS_HELP, coordinates, describeAccuracy, describeMovement, describeWhere, directionsUrl } from "@/lib/describe";
import { formatDateTime, formatSpeedKph, relativeTime } from "@/lib/format";

/**
 * Everything about one asset at a glance, in the order people ask: where is it, how old is that, is it moving,
 * battery, anything wrong. Shared by the desktop side panel and the phone bottom sheet.
 */
export function AssetSummary({ asset, freshness, onClose }: { asset: AssetOverview; freshness: Freshness; onClose?: () => void }) {
  const { now, alerts, geofences, providers, timezone } = useAssetStore();
  const provider = asset.tracking_provider_key ? providers[asset.tracking_provider_key] : undefined;
  const where = describeWhere(asset, geofences);
  const movement = describeMovement(asset, freshness);
  const accuracy = describeAccuracy(asset.accuracy_m);
  const open = alerts.filter((a) => a.asset_id === asset.id && !a.acknowledged_at && !a.resolved_at);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <AssetIcon type={asset.type} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-semibold tracking-tight">{asset.name}</h2>
          <p className="truncate text-sm text-muted-foreground">
            {TYPE_LABEL[asset.type]}
            {provider ? ` · via ${provider.name}` : ""}
          </p>
          <div className="mt-2">
            <FreshnessBadge freshness={freshness} size="md" explain />
          </div>
        </div>
        {onClose ? (
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        ) : null}
      </div>

      {open.length > 0 ? (
        <ul className="space-y-2">
          {open.slice(0, 3).map((a) => (
            <li key={a.id} className={a.severity === "critical" ? "rounded-2xl bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive" : "rounded-2xl bg-fresh-recent/10 px-3.5 py-2.5 text-sm text-fresh-recent"}>
              <span className="font-medium">{a.title}</span>
              <span className="opacity-75"> · {relativeTime(a.triggered_at, now)}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="rounded-3xl border border-border bg-card p-4">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" /> {freshness === "stale" || freshness === "offline" ? "Last seen" : "Where it is"}
        </p>
        <p className="mt-1 text-lg font-semibold leading-snug">{where.title}</p>
        {where.detail ? <p className="text-sm text-muted-foreground">{where.detail}</p> : null}
        {where.hasLocation ? (
          <div className="mt-3 space-y-1 text-sm text-muted-foreground">
            <p className="flex items-center gap-2">
              <Clock className="h-4 w-4 shrink-0" />
              Updated {relativeTime(asset.last_location_at, now)}
              <span className="text-xs">({formatDateTime(asset.last_location_at, timezone)})</span>
            </p>
            {accuracy ? (
              <p className="flex items-center gap-2">
                <Crosshair className="h-4 w-4 shrink-0" />
                {accuracy}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">{FRESHNESS_HELP.unknown}</p>
        )}
        <div className="mt-4 flex gap-2">
          {where.hasLocation ? (
            <ButtonLink href={directionsUrl(asset.latitude!, asset.longitude!)} target="_blank" rel="noreferrer" variant="secondary" className="flex-1">
              <Navigation className="h-4 w-4" /> Directions
            </ButtonLink>
          ) : null}
          <Link href={`/assets/${asset.id}`} className="inline-flex h-10 flex-1 items-center justify-center gap-1 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Details <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Fact label="Movement" value={movement ?? "Unknown"} />
        {provider?.capabilities.battery ? <Fact label="Battery" value={asset.battery_level != null ? <Battery level={asset.battery_level} /> : "Unknown"} detail={asset.battery_updated_at ? `Reported ${relativeTime(asset.battery_updated_at, now)}` : undefined} /> : null}
        {asset.type === "vehicle" ? <Fact label="Speed" value={freshness === "live" || freshness === "recent" ? formatSpeedKph(asset.speed_mps) : "—"} /> : null}
        <Fact label="Last report" value={asset.last_received_at ? relativeTime(asset.last_received_at, now) : "Never"} detail="Any message from the tracker" />
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        {[
          { href: `/assets/${asset.id}?tab=history`, label: "History" },
          { href: `/assets/${asset.id}?tab=geofences`, label: "Places" },
          { href: `/assets/${asset.id}?tab=alerts`, label: "Alerts" },
          { href: `/assets/${asset.id}?tab=settings`, label: "Settings" },
        ].map((l) => (
          <Link key={l.href} href={l.href} className="inline-flex h-9 items-center gap-1 rounded-full border border-border px-3.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            {l.label} <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        ))}
      </div>

      {where.hasLocation ? (
        <BouncyAccordion
          collapsible
          items={[
            {
              id: "tech",
              title: <span className="text-sm">Technical details</span>,
              description: (
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
                  <dt className="text-muted-foreground">Coordinates</dt>
                  <dd className="font-mono">{coordinates(asset.latitude!, asset.longitude!)}</dd>
                  <dt className="text-muted-foreground">Accuracy</dt>
                  <dd>{asset.accuracy_m != null ? `±${Math.round(asset.accuracy_m)} m` : "Not reported"}</dd>
                  <dt className="text-muted-foreground">Source</dt>
                  <dd className="font-mono">{asset.last_source ?? "—"}</dd>
                  <dt className="text-muted-foreground">Received</dt>
                  <dd>{formatDateTime(asset.last_received_at, timezone)}</dd>
                </dl>
              ),
            },
          ]}
        />
      ) : null}
    </div>
  );
}
