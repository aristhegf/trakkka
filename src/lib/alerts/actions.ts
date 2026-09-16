"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export interface ActionResult {
  error?: string;
  message?: string;
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated");
  return { supabase, user };
}

export async function acknowledgeAlert(alertId: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("alerts").update({ acknowledged_at: new Date().toISOString() }).eq("id", alertId).eq("owner_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/alerts");
  return { message: "Acknowledged." };
}

export async function acknowledgeAllAlerts(): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("alerts").update({ acknowledged_at: new Date().toISOString() }).eq("owner_id", user.id).is("acknowledged_at", null);
  if (error) return { error: error.message };
  revalidatePath("/alerts");
  return { message: "All alerts acknowledged." };
}

const ruleSchema = z.object({
  id: z.string().uuid().optional(),
  asset_id: z.string().uuid().nullable(),
  rule_type: z.enum(["battery_low", "battery_critical", "speed_limit", "no_report"]),
  threshold: z.number().int().min(1).max(100).optional(),
  speed_kph: z.number().int().min(5).max(300).optional(),
  email: z.boolean().default(true),
  is_active: z.boolean().default(true),
});

export async function upsertAlertRule(input: z.input<typeof ruleSchema>): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const p = ruleSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues.map((i) => i.message).join("; ") };
  const r = p.data;
  const params = r.rule_type === "speed_limit" ? { speed_kph: r.speed_kph ?? 100 } : { threshold: r.threshold ?? (r.rule_type === "battery_critical" ? 10 : 20) };
  const channels = r.email ? ["in_app", "email"] : ["in_app"];
  const row = { owner_id: user.id, asset_id: r.asset_id, rule_type: r.rule_type, params, channels, is_active: r.is_active };
  const { error } = r.id ? await supabase.from("alert_rules").update(row).eq("id", r.id).eq("owner_id", user.id) : await supabase.from("alert_rules").insert(row);
  if (error) return { error: error.message };
  revalidatePath("/alerts");
  if (r.asset_id) revalidatePath(`/assets/${r.asset_id}`);
  return { message: "Rule saved." };
}

export async function deleteAlertRule(id: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("alert_rules").delete().eq("id", id).eq("owner_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/alerts");
  return { message: "Rule removed." };
}

export async function updateNotificationPreferences(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("notification_preferences")
    .upsert({ owner_id: user.id, in_app: true, email: formData.get("email") === "on", push: false });
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { message: "Notification preferences saved." };
}
