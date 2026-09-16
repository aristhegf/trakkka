import { createClient } from "@/lib/supabase/server";
import { GeofencesView } from "@/components/geofences/GeofencesView";

export const metadata = { title: "Places" };

export default async function GeofencesPage() {
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("home_geofence_id").maybeSingle();
  const { data: events } = await supabase
    .from("geofence_events")
    .select("id, geofence_id, asset_id, event_type, occurred_at, dwell_seconds")
    .order("occurred_at", { ascending: false })
    .limit(50);
  return <GeofencesView homeGeofenceId={profile?.home_geofence_id ?? null} events={events ?? []} />;
}
