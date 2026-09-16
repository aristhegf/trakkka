import { redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { loadSnapshot } from "@/lib/data/queries";
import { AssetStoreProvider } from "@/components/store/AssetStore";
import { ThemeProvider } from "@/components/shell/ThemeProvider";
import { AppShell } from "@/components/shell/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect("/login");
  const supabase = await createClient();
  const snap = await loadSnapshot(supabase);
  return (
    <ThemeProvider>
      <AssetStoreProvider userId={user.id} initialAssets={snap.assets} initialAlerts={snap.alerts} initialGeofences={snap.geofences} providers={snap.providers}>
        <AppShell isAdmin={snap.profile?.is_admin ?? false} displayName={snap.profile?.display_name ?? user.email ?? null}>
          {children}
        </AppShell>
      </AssetStoreProvider>
    </ThemeProvider>
  );
}
