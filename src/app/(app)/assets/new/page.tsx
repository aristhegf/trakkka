import { AssetForm } from "@/components/assets/AssetForm";
import { PageHeader } from "@/components/shell/PageHeader";

export const metadata = { title: "Add asset" };

export default function NewAssetPage() {
  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl p-4 md:p-8">
        <PageHeader title="Add an asset" description="Only register devices, pets and vehicles you own. Location data stays private to your account." backHref="/dashboard" />
        <AssetForm mode="create" />
      </div>
    </div>
  );
}
