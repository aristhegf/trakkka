"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Mail } from "lucide-react";
import { requestPasswordReset, type AuthResult } from "@/lib/auth/actions";
import { Button } from "@/components/motion/button/base";
import { Input } from "@/components/motion/input";

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState<AuthResult | undefined, FormData>(requestPasswordReset, undefined);
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Reset your password</h1>
      <p className="mt-2 text-muted-foreground">Enter your email and we&apos;ll send you a link to choose a new one.</p>
      {state?.message ? (
        <p className="mt-6 rounded-2xl bg-fresh-live/10 px-4 py-3 text-sm text-fresh-live">{state.message}</p>
      ) : (
        <form action={action} className="mt-8 space-y-4">
          <Input label="Email" name="email" type="email" autoComplete="email" required leftIcon={<Mail />} error={state?.error} />
          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
