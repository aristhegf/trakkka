// Generates the app icons from the Trakkka pin mark (same shape as LogoMark in AppShell).
// Run: node scripts/make-icons.mjs
import sharp from "sharp";
import { writeFile } from "node:fs/promises";

const INK = "#1b1915";
const PAPER = "#f5f3ee";

/** rounded: tile corners for "any" icons; full-bleed for Apple (iOS masks itself) and maskable (Android masks). */
function svg({ rounded, scale }) {
  const rect = rounded ? `<rect width="24" height="24" rx="5.4" fill="${INK}"/>` : `<rect width="24" height="24" fill="${INK}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${rect}<g transform="translate(12 12) scale(${scale}) translate(-12 -12.25)"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" fill="none" stroke="${PAPER}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="10" r="2.3" fill="${PAPER}"/></g></svg>`;
}

const any = svg({ rounded: true, scale: 0.78 });
const bleed = svg({ rounded: false, scale: 0.72 });
// Maskable: Android may crop to a circle, so keep the mark inside the central 80% safe zone.
const maskable = svg({ rounded: false, scale: 0.6 });

const png = (s, size, out) => sharp(Buffer.from(s), { density: 1200 }).resize(size, size).png().toFile(out);

await writeFile("public/icons/icon.svg", any);
await writeFile("src/app/icon.svg", any);
await png(any, 192, "public/icons/icon-192.png");
await png(any, 512, "public/icons/icon-512.png");
await png(maskable, 512, "public/icons/icon-maskable-512.png");
await png(bleed, 180, "src/app/apple-icon.png");

// favicon.ico: an ICO container holding PNG images (supported by every current browser).
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map((n) => sharp(Buffer.from(any), { density: 1200 }).resize(n, n).png().toBuffer()));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
let offset = 6 + 16 * images.length;
const entries = images.map((img, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(sizes[i] % 256, 0);
  e.writeUInt8(sizes[i] % 256, 1);
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(img.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += img.length;
  return e;
});
await writeFile("src/app/favicon.ico", Buffer.concat([header, ...entries, ...images]));
console.log("icons written");
