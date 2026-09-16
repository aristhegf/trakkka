import { Box, Car, PawPrint, Smartphone } from "lucide-react";
import type { AssetType } from "@/lib/types";
import { cn } from "@/lib/cn";

const ICONS = { pet: PawPrint, vehicle: Car, device: Smartphone, other: Box } as const;
const BG: Record<AssetType, string> = { pet: "bg-type-pet", vehicle: "bg-type-vehicle", device: "bg-type-device", other: "bg-type-other" };

export const TYPE_LABEL: Record<AssetType, string> = { pet: "Pet", vehicle: "Vehicle", device: "Device", other: "Other" };

export function AssetIcon({ type, size = "md", className, photoUrl }: { type: AssetType; size?: "sm" | "md" | "lg"; className?: string; photoUrl?: string | null }) {
  const Icon = ICONS[type];
  const dim = size === "sm" ? "h-8 w-8" : size === "lg" ? "h-16 w-16" : "h-10 w-10";
  const iconDim = size === "sm" ? "h-4 w-4" : size === "lg" ? "h-8 w-8" : "h-5 w-5";
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photoUrl} alt="" className={cn(dim, "shrink-0 rounded-full object-cover", className)} />;
  }
  return (
    <span className={cn(dim, BG[type], "flex shrink-0 items-center justify-center rounded-full text-white", className)} aria-hidden>
      <Icon className={iconDim} />
    </span>
  );
}
