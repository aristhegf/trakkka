import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadAsset } from "@/lib/data/queries";
import { AssetForm } from "@/components/assets/AssetForm";
import { PageHeader } from "@/components/shell/PageHeader";
import type { DeviceProfile, PetProfile, VehicleProfile } from "@/lib/types";

export const metadata = { title: "Edit asset" };

export default async function EditAssetPage(props: PageProps<"/assets/[id]/edit">) {
  const { id } = await props.params;
  const supabase = await createClient();
  const { asset, pet, vehicle, device } = await loadAsset(supabase, id);
  if (!asset) notFound();
  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl p-4 md:p-8">
        <PageHeader title={`Edit ${asset.name}`} backHref={`/assets/${id}`} />
        <AssetForm mode="edit" asset={asset} pet={pet as PetProfile | null} vehicle={vehicle as VehicleProfile | null} device={device as DeviceProfile | null} />
      </div>
    </div>
  );
}
