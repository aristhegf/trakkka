"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { deleteAlertRule, upsertAlertRule } from "@/lib/alerts/actions";
import { Button } from "@/components/motion/button/base";
import { Input } from "@/components/motion/input";
import { Switch } from "@/components/motion/switch";
import { FormSelect } from "@/components/kit/form";
import { Section } from "@/components/kit/page";
import { useToast } from "@/components/kit/toast";

export interface RuleLike {
  id: string;
  rule_type: string;
  params: Record<string, number>;
  channels: string[];
  is_active: boolean;
}

type RuleType = "battery_low" | "battery_critical" | "speed_limit";

export const RULE_LABEL: Record<string, string> = {
  battery_low: "Battery low",
  battery_critical: "Battery critical",
  speed_limit: "Speeding",
};

const DEFAULT_VALUE: Record<RuleType, string> = { battery_low: "20", battery_critical: "10", speed_limit: "100" };

function useGuarded() {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const guard = (fn: () => Promise<unknown>, success?: string) =>
    start(async () => {
      try {
        await fn();
        if (success) toast.success(success);
      } catch {
        toast.error("Could not save", "Check your connection and try again.");
      }
      router.refresh();
    });
  return { pending, guard, toast };
}

/** Existing rules plus a form to add one. `assetId` null means the rule applies to every asset. */
export function AlertRules({ assetId, rules, description }: { assetId: string | null; rules: RuleLike[]; description: string }) {
  const { pending, guard, toast } = useGuarded();
  const [ruleType, setRuleType] = useState<RuleType>("battery_low");
  const [value, setValue] = useState(DEFAULT_VALUE.battery_low);
  const [email, setEmail] = useState(true);

  const addRule = () => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 1 || n > 300) {
      toast.error("Enter a number between 1 and 300");
      return;
    }
    guard(
      () =>
        upsertAlertRule({
          asset_id: assetId,
          rule_type: ruleType,
          threshold: ruleType !== "speed_limit" ? n : undefined,
          speed_kph: ruleType === "speed_limit" ? n : undefined,
          email,
        }),
      "Alert rule saved",
    );
  };

  return (
    <div className="space-y-4">
      <Section title={assetId ? "Alert rules" : "Rules for all assets"} description={description}>
        {rules.length === 0 ? (
          <p className="rounded-2xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">No custom rules. The defaults above apply.</p>
        ) : (
          <ul className="space-y-2">
            {rules.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 rounded-2xl bg-muted/60 py-2 pl-4 pr-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {RULE_LABEL[r.rule_type] ?? r.rule_type} · {r.rule_type === "speed_limit" ? `above ${r.params.speed_kph} km/h` : `below ${r.params.threshold}%`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {r.channels.includes("email") ? "In app and by email" : "In app only"}
                    {!r.is_active ? " · paused" : ""}
                  </p>
                </div>
                <Button variant="ghost" size="icon" className="h-11 w-11 rounded-full" aria-label={`Delete ${RULE_LABEL[r.rule_type] ?? r.rule_type} rule`} disabled={pending} onClick={() => guard(() => deleteAlertRule(r.id), "Rule deleted")}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Add a rule">
        <div className="space-y-4">
          <div className="grid grid-cols-[1fr_7.5rem] gap-3">
            <FormSelect
              name="rule_type"
              label="When"
              defaultValue={ruleType}
              onValueChange={(v) => {
                setRuleType(v as RuleType);
                setValue(DEFAULT_VALUE[v as RuleType]);
              }}
              options={[
                { value: "battery_low", label: "Battery is low" },
                { value: "battery_critical", label: "Battery is critical" },
                { value: "speed_limit", label: "Speed is above" },
              ]}
            />
            <Input label={ruleType === "speed_limit" ? "km/h" : "Below %"} type="number" inputMode="numeric" min={1} max={300} value={value} onChange={setValue} />
          </div>
          <div className="flex min-h-11 items-center justify-between gap-3">
            <span className="text-sm">Also send an email</span>
            <Switch checked={email} onCheckedChange={setEmail} ariaLabel="Also send an email" />
          </div>
          <Button className="w-full" disabled={pending} onClick={addRule}>
            <Plus className="h-4 w-4" /> Add rule
          </Button>
        </div>
      </Section>
    </div>
  );
}
