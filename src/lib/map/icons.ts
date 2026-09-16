import type { Map as MapLibreMap } from "maplibre-gl";
import type { AssetType, Freshness } from "@/lib/types";
import { FRESHNESS_COLOR } from "@/lib/freshness";

export const TYPE_COLOR: Record<AssetType, string> = {
  pet: "#f59e0b",
  vehicle: "#3b82f6",
  device: "#8b5cf6",
  other: "#64748b",
};

/** Simple 24x24 glyph paths (Lucide-derived outlines simplified to fills). */
const GLYPH: Record<AssetType, string> = {
  // paw print
  pet: "M7.5 6.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm13 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM10.5 3.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm7 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM12 9c-3 0-6 3.2-6 6.2 0 1.5.9 2.8 2.4 2.8 1.2 0 2-.6 3.6-.6s2.4.6 3.6.6c1.5 0 2.4-1.3 2.4-2.8C18 12.2 15 9 12 9z",
  // car
  vehicle: "M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11a2 2 0 0 1 2 2v4h-2a2 2 0 1 1-4 0H9a2 2 0 1 1-4 0H3v-4a2 2 0 0 1 2-2zm2.2 0h9.6l-1-3H8.2l-1 3zM7 15a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm10 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  // phone
  device: "M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm0 2v14h8V4H8zm3 15a1 1 0 1 0 2 0 1 1 0 0 0-2 0z",
  // box
  other: "M12 2l9 5v10l-9 5-9-5V7l9-5zm0 2.3L5.5 8 12 11.7 18.5 8 12 4.3zM5 9.7v6.1l6 3.3v-6.1l-6-3.3zm14 0l-6 3.3v6.1l6-3.3V9.7z",
};

export const ASSET_TYPES: AssetType[] = ["pet", "vehicle", "device", "other"];
export const FRESHNESS_STATES: Freshness[] = ["live", "recent", "stale", "offline", "unknown"];

export function iconId(type: AssetType, freshness: Freshness): string {
  return `asset-${type}-${freshness}`;
}

function drawMarker(type: AssetType, freshness: Freshness, size = 64): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const c = size / 2;
  // freshness ring
  ctx.beginPath();
  ctx.arc(c, c, c - 2, 0, Math.PI * 2);
  ctx.fillStyle = FRESHNESS_COLOR[freshness];
  ctx.fill();
  // white gap
  ctx.beginPath();
  ctx.arc(c, c, c - 7, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  // type disc
  ctx.beginPath();
  ctx.arc(c, c, c - 10, 0, Math.PI * 2);
  ctx.fillStyle = freshness === "unknown" || freshness === "stale" ? desaturate(TYPE_COLOR[type]) : TYPE_COLOR[type];
  ctx.fill();
  // glyph
  const p = new Path2D(GLYPH[type]);
  const scale = (size * 0.5) / 24;
  ctx.save();
  ctx.translate(c - 12 * scale, c - 12 * scale);
  ctx.scale(scale, scale);
  ctx.fillStyle = "#ffffff";
  ctx.fill(p);
  ctx.restore();
  return ctx.getImageData(0, 0, size, size);
}

function desaturate(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  const l = 0.3 * r + 0.59 * g + 0.11 * b;
  const mix = (x: number) => Math.round(x * 0.45 + l * 0.55);
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

function drawArrow(size = 32): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.beginPath();
  ctx.moveTo(size / 2, 2);
  ctx.lineTo(size * 0.8, size * 0.5);
  ctx.lineTo(size / 2, size * 0.38);
  ctx.lineTo(size * 0.2, size * 0.5);
  ctx.closePath();
  ctx.fillStyle = "#0f172a";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  return ctx.getImageData(0, 0, size, size);
}

/** Registers every (type × freshness) marker image plus the heading arrow. Safe to call repeatedly. */
export function registerAssetIcons(map: MapLibreMap): void {
  for (const type of ASSET_TYPES) {
    for (const f of FRESHNESS_STATES) {
      const id = iconId(type, f);
      if (!map.hasImage(id)) map.addImage(id, drawMarker(type, f), { pixelRatio: 2 });
    }
  }
  if (!map.hasImage("heading-arrow")) map.addImage("heading-arrow", drawArrow(), { pixelRatio: 2 });
}
