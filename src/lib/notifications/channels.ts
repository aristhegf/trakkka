import "server-only";
import type { Alert } from "@/lib/types";

export interface Recipient {
  userId: string;
  email: string | null;
  displayName: string | null;
}

export interface SendResult {
  ok: boolean;
  skipped?: boolean;
  messageId?: string;
  error?: string;
}

/** A delivery channel. The dispatcher does not know which vendor sits behind it. */
export interface NotificationChannel {
  key: "email" | "push" | "sms";
  send(alert: Alert, recipient: Recipient, assetName: string | null): Promise<SendResult>;
}

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:4127";

export const emailChannel: NotificationChannel = {
  key: "email",
  async send(alert, recipient, assetName) {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.ALERT_EMAIL_FROM;
    if (!apiKey || !from) return { ok: false, skipped: true, error: "email_not_configured" };
    if (!recipient.email) return { ok: false, skipped: true, error: "no_email" };
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    const link = alert.asset_id ? `${appUrl()}/assets/${alert.asset_id}?tab=alerts` : `${appUrl()}/alerts`;
    const { data, error } = await resend.emails.send({
      from,
      to: recipient.email,
      subject: `[Trakkka] ${alert.title}`,
      text: [
        alert.title,
        alert.body ?? "",
        assetName ? `Asset: ${assetName}` : "",
        `When: ${new Date(alert.triggered_at).toLocaleString("en-GB", { timeZone: "Africa/Lagos" })} (Lagos)`,
        "",
        `Open Trakkka: ${link}`,
      ]
        .filter(Boolean)
        .join("\n"),
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, messageId: data?.id };
  },
};

/** Web Push is P2; the channel exists so queued rows are handled honestly (skipped, not failed). */
export const pushChannel: NotificationChannel = {
  key: "push",
  async send() {
    return { ok: false, skipped: true, error: "push_not_implemented" };
  },
};

export const CHANNELS: Record<string, NotificationChannel> = {
  email: emailChannel,
  push: pushChannel,
};
