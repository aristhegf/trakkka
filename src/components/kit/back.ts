"use client";

import { useEffect, useRef } from "react";

/**
 * Makes the phone's back action (Android back button, iOS edge swipe, browser Back) close an open overlay — a bottom
 * sheet, dialog or full-screen editor — instead of leaving the page.
 *
 * While `open`, one history entry is pushed (same URL). Back pops it and we call `onClose`. Closing from the UI
 * (tapping the backdrop, Cancel) removes the entry again with history.back(), so Back afterwards behaves normally.
 *
 * Next.js's patched pushState copies its router state into our entry, so popping it is a same-URL restore, not a
 * reload. Nested overlays stack by depth: Back closes the top one only.
 */

const KEY = "__trakkkaOverlay";
/** How long a UI-closed entry waits before being removed, so an overlay opening right after can reuse it. */
const RELEASE_DELAY_MS = 60;

let pendingRelease: { timer: number; depth: number } | null = null;

const depthOf = (state: unknown): number => {
  const v = (state as Record<string, unknown> | null)?.[KEY];
  return typeof v === "number" ? v : 0;
};

export function useBackToClose(open: boolean, onClose: () => void) {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;

    let depth: number;
    if (pendingRelease) {
      // An overlay just closed from the UI (e.g. the list sheet closing as an asset opens): take over its entry
      // rather than racing an async history.back() against a new pushState. Also covers React StrictMode remounts.
      window.clearTimeout(pendingRelease.timer);
      depth = pendingRelease.depth;
      pendingRelease = null;
    } else {
      depth = depthOf(window.history.state) + 1;
      window.history.pushState({ [KEY]: depth }, "");
    }
    const href = window.location.href;
    let popped = false;

    const onPop = () => {
      if (depthOf(window.history.state) < depth) {
        popped = true;
        closeRef.current();
      }
    };
    window.addEventListener("popstate", onPop);

    return () => {
      window.removeEventListener("popstate", onPop);
      if (popped || depthOf(window.history.state) !== depth) return; // closed by Back, or already navigated away
      const timer = window.setTimeout(() => {
        pendingRelease = null;
        // Skip if a link navigated elsewhere in the meantime: going back would undo that navigation.
        if (window.location.href === href && depthOf(window.history.state) === depth) window.history.back();
      }, RELEASE_DELAY_MS);
      pendingRelease = { timer, depth };
    };
  }, [open]);
}
