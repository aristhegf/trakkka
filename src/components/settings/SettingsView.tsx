"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import { ChevronRight, Lock, LogOut, Monitor, Moon, ShieldCheck, Sun, Trash2, User } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/motion/button/base";
import { Input } from "@/components/motion/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import { BouncyAccordion } from "@/components/motion/bouncy-accordion";
import { FormSwitch } from "@/components/kit/form";
import { Page, PageHeader, Section } from "@/components/kit/page";
import { ConfirmDialog } from "@/components/kit/confirm";
import { useActionToast } from "@/components/kit/toast";
import { useThemeChoice } from "@/components/kit/theme";
import { updateProfile, type ActionResult } from "@/lib/settings/actions";
import { updateNotificationPreferences } from "@/lib/alerts/actions";
import { deleteAccount, signOut, updatePassword } from "@/lib/auth/actions";
import { relativeTime } from "@/lib/format";
import { useAssetStore } from "@/components/store/AssetStore";

interface AuditRow {
  id: number;
  action: string;
  target_table: string | null;
  target_id: string | null;
  created_at: string;
}

const humanise = (action: string) => {
  const s = action.replace(/[._]/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** Shows each new server-action result once as a toast. */
function useResultToast(result: ActionResult | undefined, success?: string) {
  const report = useActionToast();
  useEffect(() => {
    report(result, success);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);
}

export function SettingsView({ email, displayName, timezone, emailAlerts, hasPassword, audit, isAdmin }: { email: string; displayName: string; timezone: string; emailAlerts: boolean; hasPassword: boolean; audit: AuditRow[]; isAdmin: boolean }) {
  const { choice, setChoice } = useThemeChoice();
  const { now } = useAssetStore();
  const [profile, profileAction, profilePending] = useActionState<ActionResult | undefined, FormData>(updateProfile, undefined);
  const [notif, notifAction, notifPending] = useActionState<ActionResult | undefined, FormData>(updateNotificationPreferences, undefined);
  const [pw, pwAction, pwPending] = useActionState<ActionResult | undefined, FormData>(updatePassword, undefined);
  const [del, delAction, delPending] = useActionState<ActionResult | undefined, FormData>(deleteAccount, undefined);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useResultToast(profile, "Profile saved");
  useResultToast(notif, "Notifications saved");
  useResultToast(pw, "Password updated");
  useResultToast(del);

  return (
    <Page>
      <PageHeader title="Settings" description={`Signed in as ${email}`} />

      <div className="space-y-4">
        <Section title="Appearance">
          <Tabs value={choice ?? ""} onValueChange={setChoice} variant="segment">
            <TabsList className="grid w-full grid-cols-3 bg-muted p-1">
              {[
                { v: "light", label: "Light", icon: <Sun className="h-4 w-4" /> },
                { v: "dark", label: "Dark", icon: <Moon className="h-4 w-4" /> },
                { v: "system", label: "Auto", icon: <Monitor className="h-4 w-4" /> },
              ].map((t) => (
                <TabsTrigger key={t.v} value={t.v} className="h-11 w-full gap-1.5">
                  {t.icon} {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </Section>

        <Section title="Profile">
          <form action={profileAction} className="space-y-4">
            <Input label="Your name" name="display_name" defaultValue={displayName} maxLength={80} leftIcon={<User />} />
            <div className="flex flex-col gap-1.5">
              <Input label="Time zone" name="timezone" defaultValue={timezone} placeholder="Africa/Lagos" />
              <p className="px-1 text-xs text-muted-foreground">Decides where each day starts and ends in history.</p>
            </div>
            <Button type="submit" disabled={profilePending}>
              {profilePending ? "Saving…" : "Save profile"}
            </Button>
          </form>
        </Section>

        <Section title="Notifications" description="Alerts always show inside Trakkka.">
          <form action={notifAction} className="space-y-4">
            <FormSwitch name="email" label="Email me when an alert fires" description={`Sent to ${email}`} defaultChecked={emailAlerts} />
            <Button type="submit" disabled={notifPending}>
              {notifPending ? "Saving…" : "Save notifications"}
            </Button>
          </form>
        </Section>

        {hasPassword ? (
          <Section title="Password">
            <form action={pwAction} className="space-y-4">
              <Input label="New password" name="password" type="password" autoComplete="new-password" minLength={8} required leftIcon={<Lock />} placeholder="At least 8 characters" />
              <Input label="Type it again" name="confirm" type="password" autoComplete="new-password" minLength={8} required leftIcon={<Lock />} />
              <Button type="submit" disabled={pwPending}>
                {pwPending ? "Updating…" : "Change password"}
              </Button>
            </form>
          </Section>
        ) : null}

        <Section title="Account activity" description="Sign-ins and changes, for your security.">
          {audit.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
          ) : (
            <BouncyAccordion
              collapsible
              items={[
                {
                  id: "activity",
                  title: <span className="text-sm">Show the last {audit.length} events</span>,
                  description: (
                    <ul className="space-y-1.5 text-sm">
                      {audit.map((a) => (
                        <li key={a.id} className="flex justify-between gap-3">
                          <span className="truncate">{humanise(a.action)}</span>
                          <span className="shrink-0 text-muted-foreground">{relativeTime(a.created_at, now)}</span>
                        </li>
                      ))}
                    </ul>
                  ),
                },
              ]}
            />
          )}
        </Section>

        <Section title="Account">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-muted text-sm font-semibold uppercase">{(displayName || email).charAt(0)}</span>
            <div className="min-w-0">
              {displayName ? <p className="truncate text-sm font-medium">{displayName}</p> : null}
              <p className="truncate text-sm text-muted-foreground">{email}</p>
            </div>
          </div>
          {isAdmin ? (
            <Link href="/admin" className="mt-3 flex min-h-11 items-center gap-3 rounded-2xl bg-muted/60 px-4 text-sm font-medium hover:bg-muted">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" /> Admin <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
            </Link>
          ) : null}
          <form action={signOut} className="mt-3">
            <Button type="submit" variant="secondary" className="h-11 w-full">
              <LogOut className="h-4 w-4" /> Sign out
            </Button>
          </form>
        </Section>

        <Section title="Delete account" className="border-destructive/30" description="Removes your account, every asset, all location history, places, alerts and photos. This cannot be undone.">
          <Button variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="h-4 w-4" /> Delete my account
          </Button>
        </Section>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete your account?"
        body="Everything goes: assets, history, places, alerts and photos. You will be signed out."
        confirmLabel="Delete everything"
        requireText="DELETE"
        pending={delPending}
        onConfirm={() => {
          const fd = new FormData();
          fd.set("confirm", "DELETE");
          startTransition(() => delAction(fd));
        }}
      />
    </Page>
  );
}
