import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Page, PageHeader, Section } from "@/components/kit/page";
import { relativeTime, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

function hoursAgoIso(h: number): string {
  return new Date(Date.now() - h * 3600 * 1000).toISOString();
}

/**
 * Internal observability. Gated by profiles.is_admin (set via SQL only). Everything shown is
 * fetched under the admin's own RLS session; the admin policies on ingest_events / notification_events
 * grant read access.
 */
export default async function AdminPage(props: PageProps<"/admin">) {
  const sp = await props.searchParams;
  const status = typeof sp.status === "string" ? sp.status : "";
  const supabase = await createClient();
  const { data: me } = await supabase.from("profiles").select("is_admin").maybeSingle();
  if (!me?.is_admin) notFound();

  let ingestQuery = supabase.from("ingest_events").select("id, provider_key, device_id, external_device_id, received_at, status, reason, location_id, processing_ms, request_ip").order("received_at", { ascending: false }).limit(100);
  if (status) ingestQuery = ingestQuery.eq("status", status);

  const [{ data: providers }, { data: devices }, { data: ingest }, { data: notifs }, { data: counts }, { data: assets }] = await Promise.all([
    supabase.from("tracking_providers").select("*").order("key"),
    supabase.from("asset_devices").select("id, asset_id, provider_key, external_device_id, status, last_sync_at, last_error, last_error_at").order("last_sync_at", { ascending: false, nullsFirst: false }).limit(100),
    ingestQuery,
    supabase.from("notification_events").select("id, alert_id, channel, status, attempts, error, queued_at, sent_at").order("queued_at", { ascending: false }).limit(50),
    supabase.from("ingest_events").select("status").gte("received_at", hoursAgoIso(24)),
    supabase.from("asset_overview").select("id, name, tracking_provider_key, last_location_at, last_received_at, connection_status, age_seconds").order("name"),
  ]);

  const tally = (counts ?? []).reduce<Record<string, number>>((acc, r) => ((acc[r.status] = (acc[r.status] ?? 0) + 1), acc), {});
  const assetName = Object.fromEntries((assets ?? []).map((a) => [a.id, a.name]));

  return (
    <Page wide>
      <div className="space-y-4">
        <PageHeader title="Admin" description="Providers, integrations, ingest outcomes and notification deliveries. Read-only." />

        <Section title="Ingest outcomes, last 24 h">
          <div className="flex flex-wrap gap-2">
            {["accepted", "sampled", "duplicate", "out_of_order", "rejected", "error"].map((s) => (
              <a key={s} href={status === s ? "/admin" : `/admin?status=${s}`} className={cn("inline-flex h-11 items-center rounded-full border border-border bg-card px-4 text-sm hover:bg-muted", status === s && "border-primary ring-2 ring-primary/20")}>
                <span className="text-muted-foreground">{s.replace(/_/g, " ")}</span>
                <span className="ml-2 font-semibold tabular-nums">{tally[s] ?? 0}</span>
              </a>
            ))}
          </div>
        </Section>

        <Section title="Tracking providers">
          <Table
            head={["Key", "Kind", "Live / recent / stale (s)", "No-report after", "Sample floor", "Active"]}
            rows={(providers ?? []).map((p) => [p.key, p.kind, `${p.live_after_s} / ${p.recent_after_s} / ${p.stale_after_s}`, p.offline_after_s ? `${p.offline_after_s}s` : "off", `${p.min_sample_interval_s}s`, p.is_active ? "yes" : "no"])}
          />
        </Section>

        <Section title="Assets · last received vs last location">
          <Table
            head={["Asset", "Provider", "Last location", "Last received", "Connection"]}
            rows={(assets ?? []).map((a) => [a.name, a.tracking_provider_key ?? "—", a.last_location_at ? `${relativeTime(a.last_location_at)}` : "never", a.last_received_at ? relativeTime(a.last_received_at) : "never", a.connection_status ?? "—"])}
          />
        </Section>

        <Section title="Device integrations">
          <Table
            head={["Asset", "Provider", "External ID", "Status", "Last sync", "Last error"]}
            rows={(devices ?? []).map((d) => [assetName[d.asset_id] ?? d.asset_id.slice(0, 8), d.provider_key, d.external_device_id, d.status, d.last_sync_at ? relativeTime(d.last_sync_at) : "never", d.last_error ? `${d.last_error} (${relativeTime(d.last_error_at)})` : "—"])}
          />
        </Section>

        <Section title={status ? `Ingest events · ${status.replace(/_/g, " ")}` : "Ingest events"}>
          <Table
            head={["When", "Provider", "Device", "Status", "Reason", "Location id", "ms", "IP"]}
            rows={(ingest ?? []).map((e) => [formatDateTime(e.received_at), e.provider_key ?? "—", e.external_device_id ?? (e.device_id ? e.device_id.slice(0, 8) : "—"), e.status, e.reason ?? "", e.location_id ?? "", e.processing_ms ?? "", e.request_ip ?? ""])}
          />
        </Section>

        <Section title="Notification deliveries">
          <Table
            head={["Queued", "Channel", "Status", "Attempts", "Sent", "Error"]}
            rows={(notifs ?? []).map((n) => [formatDateTime(n.queued_at), n.channel, n.status, n.attempts, n.sent_at ? formatDateTime(n.sent_at) : "", n.error ?? ""])}
          />
        </Section>

        <p className="px-1 text-xs text-muted-foreground">Realtime connection health shows per session in the header indicator.</p>
      </div>
    </Page>
  );
}

function Table({ head, rows }: { head: string[]; rows: (string | number | null)[][] }) {
  return (
    <div className="-mx-4 overflow-x-auto md:-mx-5">
      <table className="w-full text-left text-xs">
        <thead className="border-y border-border bg-muted/50 text-[11px] text-muted-foreground">
          <tr>
            {head.map((h) => (
              <th key={h} className="whitespace-nowrap px-4 py-2 font-medium md:px-5">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={head.length} className="px-4 py-4 text-center text-muted-foreground">
                Nothing yet.
              </td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j} className="max-w-64 truncate px-4 py-2 font-mono md:px-5">
                    {c ?? ""}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
