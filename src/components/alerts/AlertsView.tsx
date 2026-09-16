"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellRing, CheckCheck } from "lucide-react";
import { useAssetStore } from "@/components/store/AssetStore";
import { acknowledgeAlert, acknowledgeAllAlerts } from "@/lib/alerts/actions";
import { AlertRow } from "./AlertRow";
import { AlertRules } from "./Rules";
import { Button } from "@/components/motion/button/base";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import { EmptyState, Page, PageHeader } from "@/components/kit/page";
import { useToast } from "@/components/kit/toast";
import type { Alert } from "@/lib/types";

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
  const toast = useToast();
  const [pending, start] = useTransition();
  const [filter, setFilter] = useState<"open" | "all">("open");
  const assetName = useMemo(() => Object.fromEntries(assetList.map((a) => [a.id, a.name])), [assetList]);

  const merged = useMemo(() => {
    const m = new Map<string, Alert>();
    for (const a of history) m.set(a.id, a);
    for (const a of live) m.set(a.id, a);
    return [...m.values()].sort((a, b) => Date.parse(b.triggered_at) - Date.parse(a.triggered_at));
  }, [history, live]);
  const open = merged.filter((a) => !a.acknowledged_at && !a.resolved_at);
  const shown = filter === "open" ? open : merged;

  const ack = (fn: () => Promise<unknown>, success?: string) =>
    start(async () => {
      try {
        await fn();
        if (success) toast.success(success);
      } catch {
        toast.error("Could not update", "Check your connection and try again.");
      }
      router.refresh();
    });

  return (
    <Page wide>
      <PageHeader
        title="Alerts"
        description="Arrivals and departures, low battery, speeding, and trackers that stop reporting."
        actions={
          open.length > 0 ? (
            <Button variant="secondary" className="max-md:h-10 max-md:px-4" disabled={pending} onClick={() => ack(() => acknowledgeAllAlerts(), "All alerts marked as seen")}>
              <CheckCheck className="h-4 w-4" /> <span className="sm:hidden">All seen</span>
              <span className="max-sm:hidden">Mark all as seen</span>
            </Button>
          ) : null
        }
      />

      <div className="grid gap-6 md:grid-cols-[1fr_380px]">
        <div className="min-w-0">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as "open" | "all")} variant="pill" className="mb-3">
            <TabsList className="border border-border">
              <TabsTrigger value="open" className="h-9">
                Needs a look{open.length > 0 ? ` · ${open.length}` : ""}
              </TabsTrigger>
              <TabsTrigger value="all" className="h-9">
                All
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {shown.length === 0 ? (
            <EmptyState icon={<BellRing />} title={filter === "open" ? "All clear" : "No alerts yet"} body={filter === "open" ? "Nothing needs your attention right now." : "Alerts appear here when something happens to one of your assets."} />
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-3xl border border-border bg-card">
              {shown.map((a) => (
                <AlertRow key={a.id} alert={a} now={now} assetName={a.asset_id ? assetName[a.asset_id] : undefined} onAcknowledge={a.acknowledged_at ? undefined : () => ack(() => acknowledgeAlert(a.id))} />
              ))}
            </ul>
          )}
        </div>

        <AlertRules
          assetId={null}
          rules={rules.filter((r) => !r.asset_id)}
          description="Defaults: battery low at 20%, critical at 10%. A rule on an asset's own Alerts tab overrides these. Arrive and leave alerts are set per place."
        />
      </div>
    </Page>
  );
}
