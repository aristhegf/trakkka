"use client";

import { useState } from "react";
import { MorphingModal } from "@/components/motion/morphing-modal";
import { Button } from "@/components/motion/button/base";
import { Input } from "@/components/motion/input";

/**
 * Confirmation for destructive actions (beui Morphing Modal). With `requireText`, the user must type the word to
 * enable the button, used for account deletion.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel = "Delete",
  requireText,
  pending = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: string;
  confirmLabel?: string;
  requireText?: string;
  pending?: boolean;
}) {
  const [typed, setTyped] = useState("");
  const ready = !requireText || typed.trim() === requireText;
  return (
    <MorphingModal
      viewId={open ? "confirm" : null}
      onClose={() => {
        setTyped("");
        onClose();
      }}
      placement="center"
    >
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{body}</p>
        </div>
        {requireText ? <Input label={`Type ${requireText} to confirm`} value={typed} onChange={setTyped} autoComplete="off" /> : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={!ready || pending} onClick={onConfirm}>
            {pending ? "Working…" : confirmLabel}
          </Button>
        </div>
      </div>
    </MorphingModal>
  );
}
