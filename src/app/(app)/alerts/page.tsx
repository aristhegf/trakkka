import { createClient } from "@/lib/supabase/server";
import { AlertsView } from "@/components/alerts/AlertsView";
import type { Alert } from "@/lib/types";

export const metadata = { title: "Alerts" };

export default async function AlertsPage() {
  const supabase = await createClient();
  const [{ data: history }, { data: rules }] = await Promise.all([
    supabase.from("alerts").select("*").order("triggered_at", { ascending: false }).limit(200),
    supabase.from("alert_rules").select("id, asset_id, rule_type, params, channels, is_active").order("created_at"),
  ]);
  return <AlertsView history={(history ?? []) as Alert[]} rules={(rules ?? []) as { id: string; asset_id: string | null; rule_type: string; params: Record<string, number>; channels: string[]; is_active: boolean }[]} />;
}
