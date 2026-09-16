"use client";

import { useActionState } from "react";
import { Lock, Mail, User } from "lucide-react";
import { signInWithGoogle, signUpWithPassword, type AuthResult } from "@/lib/auth/actions";
import { Button } from "@/components/motion/button/base";
import { Input } from "@/components/motion/input";
import { GoogleIcon } from "@/components/icons";

export function SignupForm() {
  const [state, action, pending] = useActionState<AuthResult | undefined, FormData>(signUpWithPassword, undefined);
  if (state?.message) {
    return (
      <div className="mt-8 rounded-3xl border border-border bg-card p-5">
        <p className="font-medium">Check your email</p>
        <p className="mt-1 text-sm text-muted-foreground">{state.message}</p>
      </div>
    );
  }
  return (
    <div className="mt-8 space-y-5">
      <form action={signInWithGoogle}>
        <Button type="submit" variant="secondary" size="lg" className="w-full">
          <GoogleIcon className="h-5 w-5" /> Continue with Google
        </Button>
      </form>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" /> or with email <span className="h-px flex-1 bg-border" />
      </div>
      <form action={action} className="space-y-4">
        <Input label="Your name" name="name" autoComplete="name" maxLength={80} leftIcon={<User />} />
        <Input label="Email" name="email" type="email" autoComplete="email" required leftIcon={<Mail />} placeholder="you@example.com" />
        <Input label="Password" name="password" type="password" autoComplete="new-password" minLength={8} required leftIcon={<Lock />} placeholder="At least 8 characters" error={state?.error} />
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </div>
  );
}
