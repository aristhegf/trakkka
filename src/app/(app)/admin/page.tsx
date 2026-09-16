import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shell/PageHeader";
import { relativeTime, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/cn";

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
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-8 p-4 md:p-8">
        <PageHeader title="Admin · observability" description="Providers, integrations, ingest outcomes, notification deliveries. Read-only." />

        <section>
          <h2 className="mb-2 text-sm font-semibold">Ingest outcomes, last 24 h</h2>
          <div className="flex flex-wrap gap-2">
            {["accepted", "sampled", "duplicate", "out_of_order", "rejected", "error"].map((s) => (
              <a key={s} href={status === s ? "/admin" : `/admin?status=${s}`} className={cn("rounded-lg border border-border bg-surface px-3 py-2 text-sm hover:bg-surface-2", status === s && "border-accent")}>
                <span className="text-xs uppercase tracking-wide text-muted">{s}</span>
                <span className="ml-2 font-semibold tabular-nums">{tally[s] ?? 0}</span>
              </a>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold">Tracking providers</h2>
          <Table
            head={["Key", "Kind", "Live / recent / stale (s)", "No-report after", "Sample floor", "Active"]}
            rows={(providers ?? []).map((p) => [p.key, p.kind, `${p.live_after_s} / ${p.recent_after_s} / ${p.stale_after_s}`, p.offline_after_s ? `${p.offline_after_s}s` : "off", `${p.min_sample_interval_s}s`, p.is_active ? "yes" : "no"])}
          />
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold">Assets · last received vs last location</h2>
          <Table
            head={["Asset", "Provider", "Last location", "Last received", "Connection"]}
            rows={(assets ?? []).map((a) => [a.name, a.tracking_provider_key ?? "—", a.last_location_at ? `${relativeTime(a.last_location_at)}` : "never", a.last_received_at ? relativeTime(a.last_received_at) : "never", a.connection_status ?? "—"])}
          />
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold">Device integrations</h2>
          <Table
            head={["Asset", "Provider", "External ID", "Status", "Last sync", "Last error"]}
            rows={(devices ?? []).map((d) => [assetName[d.asset_id] ?? d.asset_id.slice(0, 8), d.provider_key, d.external_device_id, d.status, d.last_sync_at ? relativeTime(d.last_sync_at) : "never", d.last_error ? `${d.last_error} (${relativeTime(d.last_error_at)})` : "—"])}
          />
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold">Ingest events {status ? `· ${status}` : ""}</h2>
          <Table
            head={["When", "Provider", "Device", "Status", "Reason", "Location id", "ms", "IP"]}
            rows={(ingest ?? []).map((e) => [formatDateTime(e.received_at), e.provider_key ?? "—", e.external_device_id ?? (e.device_id ? e.device_id.slice(0, 8) : "—"), e.status, e.reason ?? "", e.location_id ?? "", e.processing_ms ?? "", e.request_ip ?? ""])}
          />
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold">Notification deliveries</h2>
          <Table
            head={["Queued", "Channel", "Status", "Attempts", "Sent", "Error"]}
            rows={(notifs ?? []).map((n) => [formatDateTime(n.queued_at), n.channel, n.status, n.attempts, n.sent_at ? formatDateTime(n.sent_at) : "", n.error ?? ""])}
          />
        </section>

        <p className="text-xs text-muted">Realtime connection health is visible per session in the sidebar indicator. Presence-based connection listing is a P2 item.</p>
      </div>
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: (string | number | null)[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full text-left text-xs">
        <thead className="bg-surface-2 text-[10px] uppercase tracking-wide text-muted">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={head.length} className="px-3 py-4 text-center text-muted">
                Nothing yet.
              </td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j} className="max-w-64 truncate px-3 py-1.5 font-mono">
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
