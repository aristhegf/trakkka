import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getProvider } from "@/lib/tracking/registry";
import { hashToken, looksLikeDeviceToken } from "@/lib/tracking/tokens";
import type { DeviceContext } from "@/lib/tracking/types";
import { ingestRecords, logRejectedIngest, requestMeta } from "@/lib/ingest/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 64 * 1024;
const DEVICE_RATE = { limit: 240, windowS: 60 }; // 4 req/s sustained per device
const USER_RATE = { limit: 120, windowS: 60 };

/**
 * POST /api/ingest/[provider]
 * Push providers authenticate with a per-device bearer token (`awd_...`).
 * Client-reported/manual providers authenticate with the user's session and pass `assetId`.
 * Returns 200 with per-record outcomes for anything the DB decided (accepted/duplicate/out_of_order/rejected)
 * so upstream webhooks do not retry forever; 4xx only for auth/format problems; 5xx for real failures.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: providerKey } = await params;
  const provider = getProvider(providerKey);
  const meta = requestMeta(req);
  if (!provider) return NextResponse.json({ error: "unknown_provider" }, { status: 404 });
  if (provider.auth === "none") return NextResponse.json({ error: "provider_not_ingestable" }, { status: 405 });

  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > MAX_BODY_BYTES) return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ error: "payload_too_large" }, { status: 413 });

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "server_not_configured", detail: "SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 503 });
  }
  let ctx: DeviceContext | null = null;
  let rateKey: string;

  if (provider.auth === "device_token") {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!looksLikeDeviceToken(token)) {
      await logRejectedIngest(admin, { providerKey: provider.key, reason: "missing_token", ...meta });
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const { data: dev } = await admin
      .from("asset_devices")
      .select("id, asset_id, owner_id, external_device_id, provider_key")
      .eq("ingest_token_hash", hashToken(token))
      .maybeSingle();
    if (!dev || dev.provider_key !== provider.key) {
      await logRejectedIngest(admin, { providerKey: provider.key, reason: "invalid_token", ...meta });
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    ctx = { deviceId: dev.id, assetId: dev.asset_id, ownerId: dev.owner_id, externalDeviceId: dev.external_device_id, providerKey: provider.key };
    rateKey = `dev:${dev.id}`;
  } else {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const assetId = body && typeof body === "object" && typeof (body as { assetId?: unknown }).assetId === "string"
      ? (body as { assetId: string }).assetId
      : null;
    if (!assetId) return NextResponse.json({ error: "assetId_required" }, { status: 400 });
    // Ownership check under RLS, then (auto-)provision the device row for this provider.
    const { data: asset } = await supabase.from("assets").select("id, owner_id").eq("id", assetId).maybeSingle();
    if (!asset || asset.owner_id !== user.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const externalId = `${provider.key}:${user.id}:${assetId}`;
    const { data: dev, error: devErr } = await admin
      .from("asset_devices")
      .upsert(
        { asset_id: assetId, owner_id: user.id, provider_key: provider.key, external_device_id: externalId },
        { onConflict: "provider_key,external_device_id" },
      )
      .select("id, asset_id, owner_id, external_device_id")
      .single();
    if (devErr || !dev) return NextResponse.json({ error: "device_provision_failed" }, { status: 500 });
    ctx = { deviceId: dev.id, assetId: dev.asset_id, ownerId: dev.owner_id, externalDeviceId: dev.external_device_id, providerKey: provider.key };
    rateKey = `user:${user.id}`;
  }

  const rate = provider.auth === "device_token" ? DEVICE_RATE : USER_RATE;
  const { data: allowed } = await admin.rpc("rate_limit_take", { p_key: rateKey, p_limit: rate.limit, p_window_s: rate.windowS });
  if (allowed === false) {
    await logRejectedIngest(admin, { providerKey: provider.key, deviceId: ctx.deviceId, ownerId: ctx.ownerId, reason: "rate_limited", ...meta });
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(rate.windowS) } });
  }

  let parsed;
  try {
    parsed = provider.parse(body, ctx);
  } catch (e) {
    const reason = e instanceof ZodError ? "schema:" + e.issues.map((i) => i.path.join(".") + " " + i.message).join("; ").slice(0, 400) : "parse_error";
    await logRejectedIngest(admin, {
      providerKey: provider.key,
      deviceId: ctx.deviceId,
      ownerId: ctx.ownerId,
      externalDeviceId: ctx.externalDeviceId,
      reason,
      payload: body,
      ...meta,
    });
    return NextResponse.json({ error: "invalid_payload", detail: reason }, { status: 422 });
  }

  if (parsed.locations.length === 0 && parsed.statuses.length === 0) {
    return NextResponse.json({ results: [], note: "no_records" });
  }

  try {
    const results = await ingestRecords(ctx, parsed.locations, parsed.statuses, meta, admin);
    const hasError = results.some((r) => r.status === "error");
    return NextResponse.json({ results }, { status: hasError ? 500 : 200 });
  } catch (e) {
    return NextResponse.json({ error: "ingest_failed", detail: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
