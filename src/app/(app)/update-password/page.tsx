"use client";

import { useActionState } from "react";
import { CheckCircle2, Lock } from "lucide-react";
import { updatePassword } from "@/lib/auth/actions";
import type { AuthResult } from "@/lib/auth/actions";
import { Button } from "@/components/motion/button/base";
import { Input } from "@/components/motion/input";
import { NavButton } from "@/components/kit/nav-button";
import { Page, PageHeader, Section } from "@/components/kit/page";

export default function UpdatePasswordPage() {
  const [state, action, pending] = useActionState<AuthResult | undefined, FormData>(updatePassword, undefined);
  return (
    <Page className="max-w-md">
      <PageHeader title="Choose a new password" description="Use at least 8 characters." />
      {state?.message ? (
        <Section>
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-fresh-live" />
            <div>
              <p className="font-medium">{state.message}</p>
              <NavButton href="/dashboard" className="mt-4">
                Go to the map
              </NavButton>
            </div>
          </div>
        </Section>
      ) : (
        <Section>
          <form action={action} className="space-y-4">
            <Input label="New password" name="password" type="password" autoComplete="new-password" minLength={8} required leftIcon={<Lock />} />
            <Input label="Type it again" name="confirm" type="password" autoComplete="new-password" minLength={8} required leftIcon={<Lock />} error={state?.error} />
            <Button type="submit" size="lg" className="w-full" disabled={pending}>
              {pending ? "Saving…" : "Save password"}
            </Button>
          </form>
        </Section>
      )}
    </Page>
  );
}
