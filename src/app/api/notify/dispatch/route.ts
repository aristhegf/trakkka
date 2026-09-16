import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { CHANNELS } from "@/lib/notifications/channels";
import type { Alert } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const secret = process.env.NOTIFY_DISPATCH_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (!secret || !header.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * POST /api/notify/dispatch — called by pg_cron (via pg_net) every minute while work is queued.
 * Claims up to 50 queued notification events and sends them through the channel abstraction.
 */
export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const { data: claimed, error } = await admin.rpc("claim_notifications", { p_limit: 50 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const events = (claimed ?? []) as { id: number; alert_id: string; owner_id: string; channel: string; attempts: number }[];
  let sent = 0,
    failed = 0,
    skipped = 0;

  for (const ev of events) {
    const channel = CHANNELS[ev.channel];
    const finish = (status: "sent" | "failed" | "skipped", extra: Record<string, unknown>) =>
      admin.from("notification_events").update({ status, ...extra, ...(status === "sent" ? { sent_at: new Date().toISOString() } : {}) }).eq("id", ev.id);

    if (!channel) {
      await finish("skipped", { error: "unknown_channel" });
      skipped++;
      continue;
    }
    const { data: alert } = await admin.from("alerts").select("*").eq("id", ev.alert_id).maybeSingle();
    if (!alert) {
      await finish("skipped", { error: "alert_missing" });
      skipped++;
      continue;
    }
    const [{ data: userRes }, { data: profile }, { data: asset }] = await Promise.all([
      admin.auth.admin.getUserById(ev.owner_id),
      admin.from("profiles").select("display_name").eq("id", ev.owner_id).maybeSingle(),
      alert.asset_id ? admin.from("assets").select("name").eq("id", alert.asset_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const result = await channel.send(
      alert as Alert,
      { userId: ev.owner_id, email: userRes?.user?.email ?? null, displayName: profile?.display_name ?? null },
      asset?.name ?? null,
    );
    if (result.ok) {
      await finish("sent", { provider_message_id: result.messageId ?? null, error: null });
      sent++;
    } else if (result.skipped) {
      await finish("skipped", { error: result.error ?? null });
      skipped++;
    } else {
      // Leave as queued for a retry unless attempts are exhausted.
      await admin
        .from("notification_events")
        .update({ status: ev.attempts >= 5 ? "failed" : "queued", error: result.error ?? "send_failed" })
        .eq("id", ev.id);
      failed++;
    }
  }
  return NextResponse.json({ claimed: events.length, sent, failed, skipped });
}
