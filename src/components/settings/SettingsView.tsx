"use client";

import { useActionState } from "react";
import { Moon, Sun } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useTheme } from "@/components/shell/ThemeProvider";
import { updateProfile, type ActionResult } from "@/lib/settings/actions";
import { updateNotificationPreferences } from "@/lib/alerts/actions";
import { deleteAccount, updatePassword } from "@/lib/auth/actions";
import { relativeTime } from "@/lib/format";

interface AuditRow {
  id: number;
  action: string;
  target_table: string | null;
  target_id: string | null;
  created_at: string;
}

export function SettingsView({ email, displayName, timezone, emailAlerts, hasPassword, audit }: { email: string; displayName: string; timezone: string; emailAlerts: boolean; hasPassword: boolean; audit: AuditRow[] }) {
  const { theme, setTheme } = useTheme();
  const [profile, profileAction, profilePending] = useActionState<ActionResult | undefined, FormData>(updateProfile, undefined);
  const [notif, notifAction, notifPending] = useActionState<ActionResult | undefined, FormData>(updateNotificationPreferences, undefined);
  const [pw, pwAction, pwPending] = useActionState<ActionResult | undefined, FormData>(updatePassword, undefined);
  const [del, delAction, delPending] = useActionState<ActionResult | undefined, FormData>(deleteAccount, undefined);

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-8">
        <PageHeader title="Settings" description={email} />

        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-3 text-sm font-semibold">Appearance</h2>
          <div className="flex gap-2">
            <Button variant={theme === "light" ? "primary" : "secondary"} size="sm" onClick={() => setTheme("light")}>
              <Sun className="h-3.5 w-3.5" /> Light
            </Button>
            <Button variant={theme === "dark" ? "primary" : "secondary"} size="sm" onClick={() => setTheme("dark")}>
              <Moon className="h-3.5 w-3.5" /> Dark
            </Button>
          </div>
        </section>

        <form action={profileAction} className="space-y-3 rounded-xl border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold">Profile</h2>
          <Field label="Display name">
            <Input name="display_name" defaultValue={displayName} maxLength={80} />
          </Field>
          <Field label="Timezone" hint="Used for day boundaries in history.">
            <Input name="timezone" defaultValue={timezone} />
          </Field>
          {profile?.error ? <p className="text-xs text-danger">{profile.error}</p> : null}
          {profile?.message ? <p className="text-xs text-success">{profile.message}</p> : null}
          <Button type="submit" size="sm" disabled={profilePending}>
            Save profile
          </Button>
        </form>

        <form action={notifAction} className="space-y-3 rounded-xl border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold">Notifications</h2>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="email" defaultChecked={emailAlerts} /> Email me when an alert fires
          </label>
          <p className="text-xs text-muted">In-app alerts are always on. Push notifications arrive with the Home Screen app in a later release.</p>
          {notif?.error ? <p className="text-xs text-danger">{notif.error}</p> : null}
          {notif?.message ? <p className="text-xs text-success">{notif.message}</p> : null}
          <Button type="submit" size="sm" disabled={notifPending}>
            Save notifications
          </Button>
        </form>

        {hasPassword ? (
          <form action={pwAction} className="space-y-3 rounded-xl border border-border bg-surface p-4">
            <h2 className="text-sm font-semibold">Change password</h2>
            <Field label="New password">
              <Input name="password" type="password" autoComplete="new-password" minLength={8} required />
            </Field>
            <Field label="Confirm">
              <Input name="confirm" type="password" autoComplete="new-password" minLength={8} required />
            </Field>
            {pw?.error ? <p className="text-xs text-danger">{pw.error}</p> : null}
            {pw?.message ? <p className="text-xs text-success">{pw.message}</p> : null}
            <Button type="submit" size="sm" disabled={pwPending}>
              Update password
            </Button>
          </form>
        ) : null}

        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-2 text-sm font-semibold">Recent account activity</h2>
          {audit.length === 0 ? <p className="text-xs text-muted">Nothing recorded yet.</p> : null}
          <ul className="divide-y divide-border text-xs">
            {audit.map((a) => (
              <li key={a.id} className="flex justify-between gap-2 py-1.5">
                <span className="font-mono">{a.action}</span>
                <span className="text-muted">{relativeTime(a.created_at)}</span>
              </li>
            ))}
          </ul>
        </section>

        <form action={delAction} className="space-y-3 rounded-xl border border-danger/40 bg-surface p-4">
          <h2 className="text-sm font-semibold text-danger">Delete account</h2>
          <p className="text-xs text-muted">Removes your account, every asset, all location history, geofences, alerts and photos. This cannot be undone.</p>
          <Field label="Type DELETE to confirm">
            <Input name="confirm" autoComplete="off" />
          </Field>
          {del?.error ? <p className="text-xs text-danger">{del.error}</p> : null}
          <Button type="submit" size="sm" variant="danger" disabled={delPending}>
            Delete my account
          </Button>
        </form>
      </div>
    </div>
  );
}
