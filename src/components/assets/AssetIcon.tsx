import { Box, Car, PawPrint, Smartphone } from "lucide-react";
import type { AssetType, Freshness } from "@/lib/types";
import { FRESHNESS_DOT } from "@/components/kit/status";
import { cn } from "@/lib/utils";

const ICONS = { pet: PawPrint, vehicle: Car, device: Smartphone, other: Box } as const;

export const TYPE_LABEL: Record<AssetType, string> = { pet: "Pet", vehicle: "Vehicle", device: "Device", other: "Other" };

const DIM = { sm: "h-9 w-9 rounded-xl", md: "h-11 w-11 rounded-2xl", lg: "h-16 w-16 rounded-3xl" } as const;
const ICON_DIM = { sm: "h-4 w-4", md: "h-5 w-5", lg: "h-7 w-7" } as const;
const DOT = { sm: "h-3 w-3", md: "h-3.5 w-3.5", lg: "h-4 w-4" } as const;

/**
 * Neutral tile: the glyph says what the asset is. Colour is reserved for status, shown as a small dot that matches
 * the marker ring on the map.
 */
export function AssetIcon({ type, size = "md", className, photoUrl, freshness }: { type: AssetType; size?: "sm" | "md" | "lg"; className?: string; photoUrl?: string | null; freshness?: Freshness }) {
  const Icon = ICONS[type];
  return (
    <span className={cn("relative inline-flex shrink-0", className)} aria-hidden>
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="" className={cn(DIM[size], "object-cover")} />
      ) : (
        <span className={cn(DIM[size], "grid place-items-center bg-muted text-foreground")}>
          <Icon className={ICON_DIM[size]} />
        </span>
      )}
      {freshness ? <span className={cn("absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-card", DOT[size], FRESHNESS_DOT[freshness])} /> : null}
    </span>
  );
}
