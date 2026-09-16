import type { StyleSpecification } from "maplibre-gl";

/**
 * Base map styles. OpenFreeMap needs no key and permits commercial use (no SLA).
 * Override with NEXT_PUBLIC_MAP_STYLE_LIGHT / _DARK (e.g. a MapTiler style URL) when you move to a paid host.
 */
const OPENFREEMAP_GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";

export const LIGHT_STYLE = process.env.NEXT_PUBLIC_MAP_STYLE_LIGHT ?? "https://tiles.openfreemap.org/styles/positron";
export const DARK_STYLE = process.env.NEXT_PUBLIC_MAP_STYLE_DARK ?? "https://tiles.openfreemap.org/styles/dark";

/** Font stack used for labels; must exist on the style's glyph server. */
export const LABEL_FONT = ["Noto Sans Regular"];

/**
 * Satellite: MapTiler hybrid if a key is configured, else a raster tile template from env, else disabled.
 * Google imagery is deliberately not an option: its terms forbid displaying it on a non-Google map.
 */
export function satelliteStyle(): StyleSpecification | string | null {
  const maptiler = process.env.NEXT_PUBLIC_MAPTILER_KEY;
  if (maptiler) return `https://api.maptiler.com/maps/hybrid/style.json?key=${maptiler}`;
  const tiles = process.env.NEXT_PUBLIC_SATELLITE_TILE_URL;
  if (!tiles) return null;
  return {
    version: 8,
    glyphs: OPENFREEMAP_GLYPHS,
    sources: {
      satellite: {
        type: "raster",
        tiles: [tiles],
        tileSize: 256,
        maxzoom: 19,
        attribution: process.env.NEXT_PUBLIC_SATELLITE_ATTRIBUTION ?? "Imagery",
      },
    },
    layers: [{ id: "satellite", type: "raster", source: "satellite" }],
  };
}

export const SATELLITE_AVAILABLE = Boolean(process.env.NEXT_PUBLIC_MAPTILER_KEY || process.env.NEXT_PUBLIC_SATELLITE_TILE_URL);

/** Lagos, Nigeria. Used before any asset has a location. */
export const DEFAULT_VIEW = { longitude: 3.4219, latitude: 6.4474, zoom: 11 };
