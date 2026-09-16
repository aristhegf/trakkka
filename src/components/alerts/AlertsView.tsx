"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, Trash2 } from "lucide-react";
import { useAssetStore } from "@/components/store/AssetStore";
import { acknowledgeAlert, acknowledgeAllAlerts, deleteAlertRule, upsertAlertRule } from "@/lib/alerts/actions";
import { AlertRow } from "./AlertRow";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { PageHeader } from "@/components/shell/PageHeader";
import type { Alert } from "@/lib/types";
import { cn } from "@/lib/cn";

interface RuleRow {
  id: string;
  asset_id: string | null;
  rule_type: string;
  params: Record<string, number>;
  channels: string[];
  is_active: boolean;
}

export function AlertsView({ history, rules }: { history: Alert[]; rules: RuleRow[] }) {
  const { alerts: live, assetList, now } = useAssetStore();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [ruleType, setRuleType] = useState<"battery_low" | "battery_critical" | "speed_limit">("battery_low");
  const [value, setValue] = useState("20");
  const assetName = useMemo(() => Object.fromEntries(assetList.map((a) => [a.id, a.name])), [assetList]);

  const merged = useMemo(() => {
    const m = new Map<string, Alert>();
    for (const a of history) m.set(a.id, a);
    for (const a of live) m.set(a.id, a);
    return [...m.values()].sort((a, b) => Date.parse(b.triggered_at) - Date.parse(a.triggered_at));
  }, [history, live]);
  const shown = filter === "open" ? merged.filter((a) => !a.acknowledged_at && !a.resolved_at) : merged;

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl p-4 md:p-8">
        <PageHeader
          title="Alerts"
          description="Geofence, battery, speed and silence alerts across all assets."
          actions={
            <Button size="sm" variant="secondary" disabled={pending || shown.every((a) => a.acknowledged_at)} onClick={() => start(async () => { await acknowledgeAllAlerts(); router.refresh(); })}>
              <CheckCheck className="h-3.5 w-3.5" /> Acknowledge all
            </Button>
          }
        />
        <div className="mb-3 flex gap-1 text-xs">
          {(["open", "all"] as const).map((f) => (
            <button key={f} type="button" onClick={() => setFilter(f)} className={cn("rounded-full border border-border px-3 py-1 font-medium", filter === f && "border-accent bg-accent text-accent-foreground")}>
              {f === "open" ? "Open" : "All"}
            </button>
          ))}
        </div>
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {shown.length === 0 ? <li className="p-6 text-center text-sm text-muted">{filter === "open" ? "No open alerts. Nice and quiet." : "No alerts yet."}</li> : null}
          {shown.map((a) => (
            <AlertRow
              key={a.id}
              alert={a}
              now={now}
              assetName={a.asset_id ? assetName[a.asset_id] : undefined}
              onAcknowledge={a.acknowledged_at ? undefined : () => start(async () => { await acknowledgeAlert(a.id); router.refresh(); })}
            />
          ))}
        </ul>

        <section className="mt-8">
          <h2 className="mb-1 text-base font-semibold">Global rules</h2>
          <p className="mb-3 text-xs text-muted">Apply to every asset unless an asset has its own rule. Geofence enter/exit alerts are set per geofence; no-report alerts follow each tracking source&apos;s offline threshold.</p>
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface text-sm">
            {rules.filter((r) => !r.asset_id).length === 0 ? <li className="p-3 text-muted">Using defaults: battery low 20%, critical 10%.</li> : null}
            {rules
              .filter((r) => !r.asset_id)
              .map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 p-3">
                  <span>
                    {r.rule_type.replace("_", " ")} · {r.rule_type === "speed_limit" ? `${r.params.speed_kph} km/h` : `${r.params.threshold}%`}
                    {r.channels.includes("email") ? " · email" : ""}
                  </span>
                  <Button size="sm" variant="ghost" aria-label="Delete rule" disabled={pending} onClick={() => start(async () => { await deleteAlertRule(r.id); router.refresh(); })}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-border bg-surface p-3">
            <div className="min-w-40 flex-1">
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
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await upsertAlertRule({ asset_id: null, rule_type: ruleType, threshold: ruleType !== "speed_limit" ? Number(value) : undefined, speed_kph: ruleType === "speed_limit" ? Number(value) : undefined, email: true });
                  router.refresh();
                })
              }
            >
              Add global rule
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
