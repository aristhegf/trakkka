"use client";

import { useCallback, useSyncExternalStore } from "react";

const EVENT = "trakkka:stored-flag";

function read(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false; // private mode / blocked storage: behave as unset
  }
}

/**
 * A per-browser on/off preference (e.g. 3D map view). Server render and first hydration always see `false`,
 * so there is no hydration mismatch; the stored value applies right after mount and stays in sync across tabs.
 */
export function useStoredFlag(key: string): [boolean, (next: boolean) => void] {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const onStorage = (e: StorageEvent) => {
        if (e.key === key) onChange();
      };
      const onLocal = (e: Event) => {
        if ((e as CustomEvent<string>).detail === key) onChange();
      };
      window.addEventListener("storage", onStorage);
      window.addEventListener(EVENT, onLocal);
      return () => {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener(EVENT, onLocal);
      };
    },
    [key],
  );
  const value = useSyncExternalStore(subscribe, () => read(key), () => false);
  const set = useCallback(
    (next: boolean) => {
      try {
        window.localStorage.setItem(key, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      window.dispatchEvent(new CustomEvent(EVENT, { detail: key }));
    },
    [key],
  );
  return [value, set];
}
