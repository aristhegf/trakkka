"use client";

import { useSyncExternalStore } from "react";

/** True on phone-width screens (below Tailwind's md breakpoint). False during SSR. */
export function useIsPhone(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(max-width: 767px)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(max-width: 767px)").matches,
    () => false,
  );
}
