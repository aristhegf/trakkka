"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset, type AuthResult } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState<AuthResult | undefined, FormData>(requestPasswordReset, undefined);
  return (
    <>
      <h1 className="text-xl font-semibold">Reset your password</h1>
      <p className="mt-1 text-sm text-muted">We will email you a link to choose a new one.</p>
      <form action={action} className="mt-6 space-y-3">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        {state?.error ? <p className="text-sm text-danger">{state.error}</p> : null}
        {state?.message ? <p className="text-sm text-success">{state.message}</p> : null}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Sending…" : "Send reset link"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        <Link href="/login" className="font-medium text-accent hover:underline">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
