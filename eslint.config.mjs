import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Minified MapLibre worker bundles copied from node_modules (scripts/copy-map-worker.mjs).
    "public/maplibre/**",
  ]),
  {
    // beui.dev components, copied in unmodified by `npx shadcn add @beui/...` so they can be re-synced. They predate
    // the React Compiler lint rules; keep those rules strict for our own code only.
    files: ["src/components/motion/**", "src/lib/hooks/**"],
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/immutability": "off",
      "react-hooks/preserve-manual-memoization": "off",
    },
  },
]);

export default eslintConfig;
