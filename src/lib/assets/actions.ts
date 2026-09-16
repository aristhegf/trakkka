"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateDeviceToken } from "@/lib/tracking/tokens";
import { getProvider, providerOptionsFor } from "@/lib/tracking/registry";
import { ingestRecords } from "@/lib/ingest/pipeline";
import { isValidLatLng } from "@/lib/geo";

export interface ActionResult {
  error?: string;
  message?: string;
  token?: string;
  id?: string;
}

// Absent (field not rendered, e.g. tracker ID for phone/manual sources) and blank both mean "not provided".
const optStr = (max: number) =>
  z.preprocess((v) => (v == null || (typeof v === "string" && v.trim() === "") ? null : v), z.string().trim().max(max).nullable());
const optNum = z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().finite().nullable());
const optInt = z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().nullable());

const baseSchema = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum(["device", "pet", "vehicle", "other"]),
  description: optStr(1000),
  color: z.preprocess((v) => (v == null || (typeof v === "string" && v.trim() === "") ? null : v), z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable()),
  tracking_provider_key: z.string().min(1),
  tracker_model: optStr(80),
  external_device_id: optStr(120),
});

const petSchema = z.object({
  species: optStr(40),
  breed: optStr(60),
  sex: z.preprocess((v) => (v == null || v === "" ? null : v), z.enum(["male", "female", "unknown"]).nullable()),
  date_of_birth: optStr(10),
  microchip_id: optStr(40),
  weight_kg: optNum,
  emergency_contact_name: optStr(80),
  emergency_contact_phone: optStr(40),
  medical_notes: optStr(2000),
  notes: optStr(2000),
});

const vehicleSchema = z.object({
  make: optStr(40),
  model: optStr(40),
  year: optInt,
  registration_number: optStr(20),
  vin: optStr(17),
  color: optStr(30),
  fuel_type: z.preprocess((v) => (v == null || v === "" ? null : v), z.enum(["petrol", "diesel", "electric", "hybrid", "unknown"]).nullable()),
  speed_limit_kph: optInt,
});

const deviceSchema = z.object({
  device_type: z.preprocess((v) => (v == null || v === "" ? null : v), z.enum(["phone", "tablet", "laptop", "watch", "tracker", "other"]).nullable()),
  manufacturer: optStr(40),
  model: optStr(60),
  serial_number: optStr(80),
  os: optStr(30),
  os_version: optStr(30),
});

function obj(fd: FormData): Record<string, FormDataEntryValue> {
  return Object.fromEntries(fd.entries());
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

async function saveTypeProfile(supabase: Awaited<ReturnType<typeof createClient>>, assetId: string, ownerId: string, type: string, raw: Record<string, FormDataEntryValue>) {
  if (type === "pet") {
    const p = petSchema.parse(raw);
    return supabase.from("pet_profiles").upsert({ asset_id: assetId, owner_id: ownerId, ...p });
  }
  if (type === "vehicle") {
    const v = vehicleSchema.parse(raw);
    return supabase.from("vehicle_profiles").upsert({ asset_id: assetId, owner_id: ownerId, ...v, vin: v.vin ? v.vin.toUpperCase() : null });
  }
  if (type === "device") {
    const d = deviceSchema.parse(raw);
    return supabase.from("device_profiles").upsert({ asset_id: assetId, owner_id: ownerId, ...d });
  }
  return { error: null };
}

export async function createAsset(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const raw = obj(formData);
  const parsed = baseSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  const b = parsed.data;
  if (!providerOptionsFor(b.type).includes(b.tracking_provider_key as never)) return { error: "That tracking method is not available for this asset type." };
  const provider = getProvider(b.tracking_provider_key);
  if (!provider) return { error: "Unknown tracking method." };

  const { data: asset, error } = await supabase
    .from("assets")
    .insert({ owner_id: user.id, name: b.name, type: b.type, description: b.description, color: b.color, tracking_provider_key: b.tracking_provider_key })
    .select("id")
    .single();
  if (error || !asset) return { error: error?.message ?? "Could not create asset." };

  try {
    const r = await saveTypeProfile(supabase, asset.id, user.id, b.type, raw);
    if (r.error) return { error: r.error.message };
  } catch (e) {
    return { error: e instanceof z.ZodError ? e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : "Invalid profile fields." };
  }

  let token: string | undefined;
  if (provider.auth === "device_token") {
    const t = generateDeviceToken();
    token = t.token;
    const externalId = b.external_device_id || `${provider.key}:${asset.id.slice(0, 8)}`;
    const { error: devErr } = await supabase.from("asset_devices").insert({
      asset_id: asset.id,
      owner_id: user.id,
      provider_key: provider.key,
      external_device_id: externalId,
      tracker_model: b.tracker_model,
      ingest_token_hash: t.hash,
    });
    if (devErr) return { error: devErr.code === "23505" ? "That device ID is already registered." : devErr.message };
  }
  await supabase.rpc("audit", { p_action: "asset.create", p_table: "assets", p_target: asset.id, p_meta: { type: b.type, provider: b.tracking_provider_key } });
  revalidatePath("/dashboard");
  return { id: asset.id, token, message: "Asset created." };
}

export async function updateAsset(assetId: string, _prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const raw = obj(formData);
  const parsed = baseSchema.omit({ tracking_provider_key: true, tracker_model: true, external_device_id: true }).safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  const b = parsed.data;
  const { error } = await supabase.from("assets").update({ name: b.name, description: b.description, color: b.color }).eq("id", assetId).eq("owner_id", user.id);
  if (error) return { error: error.message };
  try {
    const r = await saveTypeProfile(supabase, assetId, user.id, b.type, raw);
    if (r.error) return { error: r.error.message };
  } catch (e) {
    return { error: e instanceof z.ZodError ? e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : "Invalid profile fields." };
  }
  revalidatePath(`/assets/${assetId}`);
  revalidatePath("/dashboard");
  return { message: "Saved." };
}

export async function setTrackingEnabled(assetId: string, enabled: boolean): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("assets").update({ is_tracking_enabled: enabled }).eq("id", assetId).eq("owner_id", user.id);
  if (error) return { error: error.message };
  await supabase.rpc("audit", { p_action: enabled ? "asset.tracking.enable" : "asset.tracking.disable", p_table: "assets", p_target: assetId });
  revalidatePath(`/assets/${assetId}`);
  return { message: enabled ? "Tracking enabled." : "Tracking paused." };
}

export async function setAssetStatus(assetId: string, status: "active" | "archived" | "lost"): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("assets").update({ status }).eq("id", assetId).eq("owner_id", user.id);
  if (error) return { error: error.message };
  await supabase.rpc("audit", { p_action: "asset.status", p_table: "assets", p_target: assetId, p_meta: { status } });
  revalidatePath(`/assets/${assetId}`);
  revalidatePath("/dashboard");
  return { message: "Status updated." };
}

/** Soft delete: hidden immediately, hard-purged by the retention job after 30 days. */
export async function deleteAsset(assetId: string): Promise<void> {
  const { supabase, user } = await requireUser();
  await supabase.rpc("audit", { p_action: "asset.delete", p_table: "assets", p_target: assetId });
  await supabase.from("assets").update({ deleted_at: new Date().toISOString(), is_tracking_enabled: false }).eq("id", assetId).eq("owner_id", user.id);
  await supabase.from("asset_devices").update({ status: "paused" }).eq("asset_id", assetId);
  revalidatePath("/dashboard");
  redirect("/dashboard");
}

/** Issues a new ingest token for a device (old token stops working immediately). */
export async function rotateDeviceToken(deviceId: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const t = generateDeviceToken();
  const { data, error } = await supabase.from("asset_devices").update({ ingest_token_hash: t.hash }).eq("id", deviceId).eq("owner_id", user.id).select("asset_id").maybeSingle();
  if (error || !data) return { error: error?.message ?? "Device not found." };
  await supabase.rpc("audit", { p_action: "device.token.rotate", p_table: "asset_devices", p_target: deviceId });
  revalidatePath(`/assets/${data.asset_id}`);
  return { token: t.token, message: "New token issued. The old one no longer works." };
}

/** Manual / Find My check-in entered by the owner. Goes through the same ingest function as every other fix. */
export async function reportManualLocation(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const assetId = String(formData.get("assetId") ?? "");
  const lat = Number(formData.get("latitude"));
  const lng = Number(formData.get("longitude"));
  const note = String(formData.get("note") ?? "").slice(0, 200);
  const atRaw = String(formData.get("recordedAt") ?? "");
  if (!isValidLatLng(lat, lng)) return { error: "Enter a valid latitude and longitude." };
  const recordedAt = atRaw ? new Date(atRaw) : new Date();
  if (Number.isNaN(recordedAt.getTime())) return { error: "Invalid time." };
  if (recordedAt.getTime() > Date.now() + 60_000) return { error: "Time cannot be in the future." };

  const { data: asset } = await supabase.from("assets").select("id, owner_id, tracking_provider_key").eq("id", assetId).maybeSingle();
  if (!asset || asset.owner_id !== user.id) return { error: "Asset not found." };
  const providerKey = asset.tracking_provider_key === "apple_findmy_reported" ? "apple_findmy_reported" : "manual";
  const admin = createAdminClient();
  const externalId = `${providerKey}:${user.id}:${assetId}`;
  const { data: dev, error: devErr } = await admin
    .from("asset_devices")
    .upsert({ asset_id: assetId, owner_id: user.id, provider_key: providerKey, external_device_id: externalId }, { onConflict: "provider_key,external_device_id" })
    .select("id")
    .single();
  if (devErr || !dev) return { error: devErr?.message ?? "Could not register manual source." };
  const results = await ingestRecords(
    { deviceId: dev.id, assetId, ownerId: user.id, externalDeviceId: externalId, providerKey },
    [
      {
        recordedAt: recordedAt.toISOString(),
        latitude: lat,
        longitude: lng,
        accuracyM: null,
        altitudeM: null,
        speedMps: null,
        headingDeg: null,
        batteryLevel: null,
        connectionStatus: null,
        providerEventId: null,
        ignitionOn: null,
        fuelLevelPct: null,
        odometerKm: null,
        extra: note ? { note } : null,
      },
    ],
    [],
    { ip: null, userAgent: "manual-entry" },
    admin,
  );
  const r = results[0];
  if (!r || r.status === "error" || r.status === "rejected") return { error: `Location not saved (${r?.reason ?? "unknown"}).` };
  if (r.status === "out_of_order") return { message: "Saved to history. A newer location already exists, so the current position was not changed." };
  revalidatePath(`/assets/${assetId}`);
  return { message: "Location recorded." };
}

export async function uploadAssetPhoto(assetId: string, formData: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image." };
  if (file.size > 5 * 1024 * 1024) return { error: "Image must be under 5 MB." };
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return { error: "Use JPEG, PNG or WebP." };
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${user.id}/${assetId}.${ext}`;
  const { error } = await supabase.storage.from("asset-photos").upload(path, file, { upsert: true, contentType: file.type });
  if (error) return { error: error.message };
  await supabase.from("assets").update({ photo_path: path }).eq("id", assetId).eq("owner_id", user.id);
  revalidatePath(`/assets/${assetId}`);
  return { message: "Photo updated." };
}
