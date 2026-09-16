import type { Map as MapLibreMap } from "maplibre-gl";
import type { AssetType, Freshness } from "@/lib/types";
import { FRESHNESS_COLOR, FRESHNESS_COLOR_DARK } from "@/lib/freshness";

export type MapTheme = "light" | "dark";

/** Map paint colours per theme, matching the CSS tokens (maplibre paint cannot read CSS variables). */
export const MAP_PALETTE: Record<MapTheme, { ink: string; paper: string; primary: string; halo: string; danger: string; muted: string }> = {
  light: { ink: "#1b1915", paper: "#ffffff", primary: "#4b3bf0", halo: "#ffffff", danger: "#d42f22", muted: "#6a655b" },
  dark: { ink: "#efece6", paper: "#1a1916", primary: "#9185ff", halo: "#100f0d", danger: "#f2554a", muted: "#a39e93" },
};

/** Simple 24x24 glyph paths. The glyph says what it is; the ring colour says how fresh the location is. */
const GLYPH: Record<AssetType, string> = {
  pet: "M7.5 6.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm13 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM10.5 3.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm7 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM12 9c-3 0-6 3.2-6 6.2 0 1.5.9 2.8 2.4 2.8 1.2 0 2-.6 3.6-.6s2.4.6 3.6.6c1.5 0 2.4-1.3 2.4-2.8C18 12.2 15 9 12 9z",
  vehicle: "M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11a2 2 0 0 1 2 2v4h-2a2 2 0 1 1-4 0H9a2 2 0 1 1-4 0H3v-4a2 2 0 0 1 2-2zm2.2 0h9.6l-1-3H8.2l-1 3zM7 15a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm10 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  device: "M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm0 2v14h8V4H8zm3 15a1 1 0 1 0 2 0 1 1 0 0 0-2 0z",
  other: "M12 2l9 5v10l-9 5-9-5V7l9-5zm0 2.3L5.5 8 12 11.7 18.5 8 12 4.3zM5 9.7v6.1l6 3.3v-6.1l-6-3.3zm14 0l-6 3.3v6.1l6-3.3V9.7z",
};

export const ASSET_TYPES: AssetType[] = ["pet", "vehicle", "device", "other"];
export const FRESHNESS_STATES: Freshness[] = ["live", "recent", "stale", "offline", "unknown"];

export function iconId(type: AssetType, freshness: Freshness, theme: MapTheme): string {
  return `asset-${theme}-${type}-${freshness}`;
}

function drawMarker(type: AssetType, freshness: Freshness, theme: MapTheme, size = 72): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const c = size / 2;
  const pal = MAP_PALETTE[theme];
  const ring = (theme === "dark" ? FRESHNESS_COLOR_DARK : FRESHNESS_COLOR)[freshness];
  // soft shadow
  ctx.beginPath();
  ctx.arc(c, c + 2, c - 3, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fill();
  // freshness ring
  ctx.beginPath();
  ctx.arc(c, c, c - 4, 0, Math.PI * 2);
  ctx.fillStyle = ring;
  ctx.fill();
  // neutral disc (ink in light mode, paper-ink in dark) with a thin gap
  ctx.beginPath();
  ctx.arc(c, c, c - 11, 0, Math.PI * 2);
  ctx.fillStyle = pal.paper;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(c, c, c - 13, 0, Math.PI * 2);
  ctx.fillStyle = pal.ink;
  ctx.globalAlpha = freshness === "stale" || freshness === "unknown" || freshness === "offline" ? 0.55 : 1;
  ctx.fill();
  ctx.globalAlpha = 1;
  // glyph
  const p = new Path2D(GLYPH[type]);
  const scale = (size * 0.42) / 24;
  ctx.save();
  ctx.translate(c - 12 * scale, c - 12 * scale);
  ctx.scale(scale, scale);
  ctx.fillStyle = pal.paper;
  ctx.fill(p);
  ctx.restore();
  return ctx.getImageData(0, 0, size, size);
}

function drawArrow(theme: MapTheme, size = 32): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const pal = MAP_PALETTE[theme];
  ctx.beginPath();
  ctx.moveTo(size / 2, 2);
  ctx.lineTo(size * 0.8, size * 0.5);
  ctx.lineTo(size / 2, size * 0.38);
  ctx.lineTo(size * 0.2, size * 0.5);
  ctx.closePath();
  ctx.fillStyle = pal.primary;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = pal.halo;
  ctx.stroke();
  return ctx.getImageData(0, 0, size, size);
}

/** Registers every (theme × type × freshness) marker plus heading arrows. Safe to call repeatedly. */
export function registerAssetIcons(map: MapLibreMap): void {
  for (const theme of ["light", "dark"] as MapTheme[]) {
    for (const type of ASSET_TYPES) {
      for (const f of FRESHNESS_STATES) {
        const id = iconId(type, f, theme);
        if (!map.hasImage(id)) map.addImage(id, drawMarker(type, f, theme), { pixelRatio: 2 });
      }
    }
    const arrow = `heading-arrow-${theme}`;
    if (!map.hasImage(arrow)) map.addImage(arrow, drawArrow(theme), { pixelRatio: 2 });
  }
}
