"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Mobile-only bottom sheet with three positions: peek (header only), half, full.
 * Dragging the handle or tapping it cycles positions. Pure CSS transforms, no library.
 */
export function BottomSheet({ open, onOpenChange, peekLabel, children }: { open: boolean; onOpenChange: (o: boolean) => void; peekLabel: string; children: React.ReactNode }) {
  const [pos, setPos] = useState<"peek" | "half" | "full">(open ? "half" : "peek");
  const [prevOpen, setPrevOpen] = useState(open);
  const startY = useRef<number | null>(null);

  // Adjust position when the parent toggles `open` (state update during render, not in an effect).
  if (open !== prevOpen) {
    setPrevOpen(open);
    setPos(open ? "half" : "peek");
  }

  const heights = { peek: "translate-y-[calc(100%-52px)]", half: "translate-y-[45%]", full: "translate-y-0" };

  function onPointerDown(e: React.PointerEvent) {
    startY.current = e.clientY;
  }
  function onPointerUp(e: React.PointerEvent) {
    if (startY.current == null) return;
    const dy = e.clientY - startY.current;
    startY.current = null;
    if (Math.abs(dy) < 8) {
      setPos((p) => (p === "peek" ? "half" : p === "half" ? "full" : "peek"));
      onOpenChange(true);
    } else if (dy < -30) {
      setPos((p) => (p === "peek" ? "half" : "full"));
      onOpenChange(true);
    } else if (dy > 30) {
      setPos((p) => (p === "full" ? "half" : "peek"));
      if (pos === "half") onOpenChange(false);
    }
  }

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-20 flex h-[80dvh] flex-col rounded-t-2xl border-t border-border bg-surface shadow-[0_-8px_30px_rgba(0,0,0,0.25)] transition-transform duration-200 md:hidden",
        heights[pos],
      )}
      role="dialog"
      aria-label="Asset panel"
    >
      <button
        type="button"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        className="flex h-[52px] w-full touch-none flex-col items-center justify-center gap-1.5"
        aria-label="Toggle panel"
      >
        <span className="h-1.5 w-10 rounded-full bg-border" />
        <span className="text-xs text-muted">{peekLabel}</span>
      </button>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
