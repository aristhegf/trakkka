"use client";

import { getWorkerUrl, setWorkerUrl } from "maplibre-gl";

/**
 * MapLibre spawns a module Web Worker for tile parsing. Under Turbopack the worker URL it derives from
 * `import.meta.url` is not served (the dev server answers with HTML, and the map stays blank), so we ship
 * the worker bundle from public/ (see scripts/copy-map-worker.mjs) and point MapLibre at it.
 * Importing this module once, from any map component, is enough.
 */
if (typeof window !== "undefined" && !getWorkerUrl()) {
  setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
}

export {};
