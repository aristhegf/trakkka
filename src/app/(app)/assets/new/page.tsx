import { AssetForm } from "@/components/assets/AssetForm";
import { Page, PageHeader } from "@/components/kit/page";

export const metadata = { title: "Add asset" };

export default function NewAssetPage() {
  return (
    <Page>
      <PageHeader title="Add something to track" description="Only add phones, pets and vehicles you own or have permission to track. Locations stay private to your account." backHref="/dashboard" backLabel="Map" />
      <AssetForm mode="create" />
    </Page>
  );
}
