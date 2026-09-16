"use client";

import { useActionState } from "react";
import Link from "next/link";
import { updatePassword } from "@/lib/auth/actions";
import type { AuthResult } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shell/PageHeader";

export default function UpdatePasswordPage() {
  const [state, action, pending] = useActionState<AuthResult | undefined, FormData>(updatePassword, undefined);
  return (
    <div className="mx-auto max-w-sm p-4 md:p-8">
      <PageHeader title="Choose a new password" />
      <form action={action} className="space-y-3">
        <Field label="New password">
          <Input name="password" type="password" autoComplete="new-password" minLength={8} required />
        </Field>
        <Field label="Confirm">
          <Input name="confirm" type="password" autoComplete="new-password" minLength={8} required />
        </Field>
        {state?.error ? <p className="text-sm text-danger">{state.error}</p> : null}
        {state?.message ? (
          <p className="text-sm text-success">
            {state.message}{" "}
            <Link href="/dashboard" className="underline">
              Go to the map
            </Link>
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Saving…" : "Save password"}
        </Button>
      </form>
    </div>
  );
}
