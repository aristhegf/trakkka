"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Trash2 } from "lucide-react";
import { useAssetStore } from "@/components/store/AssetStore";
import { acknowledgeAlert, deleteAlertRule, upsertAlertRule } from "@/lib/alerts/actions";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { AlertRow } from "@/components/alerts/AlertRow";
import type { Alert, AssetOverview } from "@/lib/types";
import type { RuleRow } from "./AssetDetail";

export function AssetAlerts({ asset, rules, recentAlerts }: { asset: AssetOverview; rules: RuleRow[]; recentAlerts: Alert[] }) {
  const { alerts: liveAlerts, now } = useAssetStore();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [ruleType, setRuleType] = useState<"battery_low" | "battery_critical" | "speed_limit">("battery_low");
  const [value, setValue] = useState("20");
  const [email, setEmail] = useState(true);
  // Live alerts from the store override the server snapshot for open ones.
  const merged = new Map<string, Alert>();
  for (const a of recentAlerts) merged.set(a.id, a);
  for (const a of liveAlerts) if (a.asset_id === asset.id) merged.set(a.id, a);
  const list = [...merged.values()].sort((a, b) => Date.parse(b.triggered_at) - Date.parse(a.triggered_at));

  const addRule = () =>
    start(async () => {
      await upsertAlertRule({
        asset_id: asset.id,
        rule_type: ruleType,
        threshold: ruleType !== "speed_limit" ? Number(value) : undefined,
        speed_kph: ruleType === "speed_limit" ? Number(value) : undefined,
        email,
      });
      router.refresh();
    });

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Alerts for {asset.name}</h2>
        {list.length === 0 ? <p className="text-sm text-muted">No alerts yet.</p> : null}
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
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
      </section>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Rules for this asset</h2>
        <p className="text-xs text-muted">Defaults without rules: battery low at 20%, critical at 10%, speed alert from the vehicle profile, no-report after the provider&apos;s offline threshold. Geofence alerts are configured per geofence.</p>
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface text-sm">
          {rules.length === 0 ? <li className="p-3 text-muted">No custom rules.</li> : null}
          {rules.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 p-3">
              <span>
                {r.rule_type.replace("_", " ")} · {r.rule_type === "speed_limit" ? `${r.params.speed_kph} km/h` : `${r.params.threshold}%`}
                {r.channels.includes("email") ? " · email" : ""}
                {!r.is_active ? " · inactive" : ""}
              </span>
              <Button
                size="sm"
                variant="ghost"
                aria-label="Delete rule"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    await deleteAlertRule(r.id);
                    router.refresh();
                  })
                }
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-surface p-3">
          <div className="min-w-36 flex-1">
            <label className="mb-1 block text-xs text-muted">Rule</label>
            <Select value={ruleType} onChange={(e) => setRuleType(e.target.value as typeof ruleType)}>
              <option value="battery_low">Battery low (%)</option>
              <option value="battery_critical">Battery critical (%)</option>
              <option value="speed_limit">Speed limit (km/h)</option>
            </Select>
          </div>
          <div className="w-24">
            <label className="mb-1 block text-xs text-muted">Value</label>
            <Input type="number" min={1} max={300} value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          <label className="flex h-10 items-center gap-1.5 text-xs">
            <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} /> Email
          </label>
          <Button size="md" disabled={pending} onClick={addRule}>
            <Check className="h-3.5 w-3.5" /> Add rule
          </Button>
        </div>
      </section>
    </div>
  );
}
