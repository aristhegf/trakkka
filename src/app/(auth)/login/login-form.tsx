"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Lock, Mail } from "lucide-react";
import { signInWithGoogle, signInWithPassword, type AuthResult } from "@/lib/auth/actions";
import { Button } from "@/components/motion/button/base";
import { Input } from "@/components/motion/input";
import { GoogleIcon } from "@/components/icons";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<AuthResult | undefined, FormData>(signInWithPassword, undefined);
  return (
    <div className="mt-8 space-y-5">
      <form action={signInWithGoogle}>
        <input type="hidden" name="next" value={next} />
        <Button type="submit" variant="secondary" size="lg" className="w-full">
          <GoogleIcon className="h-5 w-5" /> Continue with Google
        </Button>
      </form>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" /> or with email <span className="h-px flex-1 bg-border" />
      </div>
      <form action={action} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <Input label="Email" name="email" type="email" autoComplete="email" required leftIcon={<Mail />} placeholder="you@example.com" />
        <div>
          <Input label="Password" name="password" type="password" autoComplete="current-password" required leftIcon={<Lock />} error={state?.error} />
          <div className="mt-1.5 flex justify-end">
            <Link href="/forgot-password" className="px-1 text-sm text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
