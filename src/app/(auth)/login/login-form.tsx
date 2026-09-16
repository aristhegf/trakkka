"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signInWithGoogle, signInWithPassword, type AuthResult } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { GoogleIcon } from "@/components/icons";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<AuthResult | undefined, FormData>(signInWithPassword, undefined);
  return (
    <div className="mt-6 space-y-4">
      <form action={signInWithGoogle}>
        <input type="hidden" name="next" value={next} />
        <Button type="submit" variant="secondary" className="w-full">
          <GoogleIcon className="h-4 w-4" /> Continue with Google
        </Button>
      </form>
      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
      </div>
      <form action={action} className="space-y-3">
        <input type="hidden" name="next" value={next} />
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div>
          <div className="flex items-baseline justify-between">
            <Label htmlFor="password">Password</Label>
            <Link href="/forgot-password" className="text-xs text-accent hover:underline">
              Forgot?
            </Link>
          </div>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        {state?.error ? <p className="text-sm text-danger">{state.error}</p> : null}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
