"use client";

import { createContext, useContext, useMemo } from "react";
import { AnimatedToastStack, useAnimatedToastStack, type ToastInput } from "@/components/motion/animated-toast-stack";

interface ToastApi {
  show: (input: ToastInput) => string;
  success: (title: string, description?: string) => string;
  error: (title: string, description?: string) => string;
  dismiss: (id: string) => void;
}

const Ctx = createContext<ToastApi | null>(null);

/** App-wide toasts (beui Animated Toast Stack). Top on phones so the bottom nav never hides them. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { toasts, showToast, dismissToast } = useAnimatedToastStack({ defaultDuration: 3800, limit: 4 });
  const api = useMemo<ToastApi>(
    () => ({
      show: showToast,
      success: (title, description) => showToast({ title, description, status: "success" }),
      error: (title, description) => showToast({ title, description, status: "error", duration: 6000 }),
      dismiss: dismissToast,
    }),
    [showToast, dismissToast],
  );
  return (
    <Ctx.Provider value={api}>
      {children}
      <AnimatedToastStack toasts={toasts} onDismiss={dismissToast} position="top-center" placement="fixed" portal maxVisible={3} className="z-[90]" />
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useToast must be used inside ToastProvider");
  return v;
}

/** Shows a server action's { error | message } result as a toast. Returns true on success. */
export function useActionToast() {
  const toast = useToast();
  return (r: { error?: string; message?: string } | undefined, fallbackSuccess?: string): boolean => {
    if (!r) return false;
    if (r.error) {
      toast.error("Something went wrong", r.error);
      return false;
    }
    if (r.message || fallbackSuccess) toast.success(r.message ?? fallbackSuccess!);
    return true;
  };
}
