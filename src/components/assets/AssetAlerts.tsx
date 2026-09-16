"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellOff } from "lucide-react";
import { useAssetStore } from "@/components/store/AssetStore";
import { acknowledgeAlert } from "@/lib/alerts/actions";
import { Section } from "@/components/kit/page";
import { AlertRow } from "@/components/alerts/AlertRow";
import { AlertRules } from "@/components/alerts/Rules";
import type { Alert, AssetOverview } from "@/lib/types";
import type { RuleRow } from "./AssetDetail";

export function AssetAlerts({ asset, rules, recentAlerts }: { asset: AssetOverview; rules: RuleRow[]; recentAlerts: Alert[] }) {
  const { alerts: liveAlerts, now } = useAssetStore();
  const router = useRouter();
  const [, start] = useTransition();
  // Live alerts from the store override the server snapshot for open ones.
  const merged = new Map<string, Alert>();
  for (const a of recentAlerts) merged.set(a.id, a);
  for (const a of liveAlerts) if (a.asset_id === asset.id) merged.set(a.id, a);
  const list = [...merged.values()].sort((a, b) => Date.parse(b.triggered_at) - Date.parse(a.triggered_at));

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Section title="Recent alerts">
        {list.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-6 text-center text-muted-foreground">
            <BellOff className="mb-2 h-6 w-6" />
            <p className="text-sm">Nothing yet. Alerts for {asset.name} show up here.</p>
          </div>
        ) : (
          <ul className="-mx-4 -mb-4 divide-y divide-border md:-mx-5 md:-mb-5">
            {list.map((a) => (
              <AlertRow
                key={a.id}
                alert={a}
                now={now}
                onAcknowledge={
                  a.acknowledged_at
                    ? undefined
                    : () =>
                        start(async () => {
                          await acknowledgeAlert(a.id);
                          router.refresh();
                        })
                }
              />
            ))}
          </ul>
        )}
      </Section>

      <AlertRules
        assetId={asset.id}
        rules={rules}
        description="Without rules you still get: battery low at 20%, critical at 10%, the vehicle's speed alert, and an alert if it stops reporting. Arrive and leave alerts are set per place."
      />
    </div>
  );
}
