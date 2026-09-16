// Copies MapLibre's worker bundle (and the shared chunk it imports) into public/maplibre/ so the
// browser can load it as a plain module script.
// MapLibre >= 5 spawns `new Worker(new URL('./maplibre-gl-worker.mjs', import.meta.url), { type: 'module' })`;
// Turbopack does not emit that URL as a servable asset in this project, so we serve the files ourselves
// and point MapLibre at them with setWorkerUrl() (see src/lib/map/setup.ts). Runs on predev/prebuild.
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = resolve(root, "node_modules/maplibre-gl/dist");
const destDir = resolve(root, "public/maplibre");
const FILES = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

mkdirSync(destDir, { recursive: true });
for (const f of FILES) {
  const src = resolve(srcDir, f);
  if (!existsSync(src)) {
    console.error(`copy-map-worker: ${src} not found. Run npm install first.`);
    process.exit(1);
  }
  copyFileSync(src, resolve(destDir, f));
}
console.log(`copy-map-worker: public/maplibre/{${FILES.join(",")}} updated`);
