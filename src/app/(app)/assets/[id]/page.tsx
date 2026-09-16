import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadAsset, signedPhotoUrl } from "@/lib/data/queries";
import { AssetDetail, type DetailTab } from "@/components/assets/AssetDetail";
import type { AssetDevice, DeviceProfile, PetProfile, VehicleProfile } from "@/lib/types";

const TABS: DetailTab[] = ["overview", "history", "geofences", "alerts", "settings"];

export async function generateMetadata(props: PageProps<"/assets/[id]">) {
  const { id } = await props.params;
  const supabase = await createClient();
  const { data } = await supabase.from("assets").select("name").eq("id", id).maybeSingle();
  return { title: data?.name ?? "Asset" };
}

export default async function AssetPage(props: PageProps<"/assets/[id]">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const tabParam = typeof sp.tab === "string" ? sp.tab : "overview";
  const tab: DetailTab = (TABS as string[]).includes(tabParam) ? (tabParam as DetailTab) : "overview";
  const supabase = await createClient();
  const { asset, pet, vehicle, device, devices } = await loadAsset(supabase, id);
  if (!asset) notFound();
  const [photoUrl, { data: rules }, { data: recentAlerts }] = await Promise.all([
    signedPhotoUrl(supabase, asset.photo_path),
    supabase.from("alert_rules").select("*").eq("asset_id", id).order("created_at"),
    supabase.from("alerts").select("*").eq("asset_id", id).order("triggered_at", { ascending: false }).limit(50),
  ]);
  return (
    <AssetDetail
      initialAsset={asset}
      pet={pet as PetProfile | null}
      vehicle={vehicle as VehicleProfile | null}
      device={device as DeviceProfile | null}
      devices={devices as AssetDevice[]}
      photoUrl={photoUrl}
      tab={tab}
      rules={(rules ?? []) as { id: string; rule_type: string; params: Record<string, number>; channels: string[]; is_active: boolean }[]}
      recentAlerts={recentAlerts ?? []}
    />
  );
}
