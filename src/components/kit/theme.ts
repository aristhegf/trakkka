"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;

/** "light" | "dark" after mount; "light" during SSR so server and first client render agree. */
export function useResolvedTheme(): "light" | "dark" {
  const { resolvedTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  return mounted && resolvedTheme === "dark" ? "dark" : "light";
}

/** The user's choice ("light" | "dark" | "system"), or null before mount. */
export function useThemeChoice(): { choice: string | null; setChoice: (t: string) => void } {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  return { choice: mounted ? (theme ?? "system") : null, setChoice: setTheme };
}
