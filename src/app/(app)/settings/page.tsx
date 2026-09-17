import { createClient, getUser } from "@/lib/supabase/server";
import { SettingsView } from "@/components/settings/SettingsView";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await getUser();
  const supabase = await createClient();
  const [{ data: profile }, { data: prefs }, { data: audit }] = await Promise.all([
    supabase.from("profiles").select("display_name, timezone, is_admin").maybeSingle(),
    supabase.from("notification_preferences").select("email, push").maybeSingle(),
    supabase.from("audit_logs").select("id, action, target_table, target_id, created_at").order("created_at", { ascending: false }).limit(30),
  ]);
  const providers = user?.app_metadata?.providers as string[] | undefined;
  return (
    <SettingsView
      email={user?.email ?? ""}
      displayName={profile?.display_name ?? ""}
      timezone={profile?.timezone ?? "Africa/Lagos"}
      emailAlerts={prefs?.email ?? true}
      hasPassword={!providers || providers.includes("email")}
      audit={audit ?? []}
      isAdmin={Boolean(profile?.is_admin)}
    />
  );
}
