"use client";

import { useActionState } from "react";
import { signInWithGoogle, signUpWithPassword, type AuthResult } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { GoogleIcon } from "@/components/icons";

export function SignupForm() {
  const [state, action, pending] = useActionState<AuthResult | undefined, FormData>(signUpWithPassword, undefined);
  return (
    <div className="mt-6 space-y-4">
      <form action={signInWithGoogle}>
        <Button type="submit" variant="secondary" className="w-full">
          <GoogleIcon className="h-4 w-4" /> Continue with Google
        </Button>
      </form>
      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
      </div>
      <form action={action} className="space-y-3">
        <div>
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" autoComplete="name" maxLength={80} />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
        </div>
        {state?.error ? <p className="text-sm text-danger">{state.error}</p> : null}
        {state?.message ? <p className="text-sm text-success">{state.message}</p> : null}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Creating…" : "Create account"}
        </Button>
      </form>
    </div>
  );
}
