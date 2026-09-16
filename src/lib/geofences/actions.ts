"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export interface ActionResult {
  error?: string;
  message?: string;
  id?: string;
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated");
  return { supabase, user };
}

const geofenceInput = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("circle"),
    id: z.string().uuid().nullable(),
    name: z.string().trim().min(1).max(60),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
    address: z.string().trim().max(200).nullable().optional(),
    center: z.object({ lat: z.number().gte(-90).lte(90), lng: z.number().gte(-180).lte(180) }),
    radius_m: z.number().min(20).max(50000),
  }),
  z.object({
    kind: z.literal("polygon"),
    id: z.string().uuid().nullable(),
    name: z.string().trim().min(1).max(60),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
    address: z.string().trim().max(200).nullable().optional(),
    ring: z.array(z.tuple([z.number().gte(-180).lte(180), z.number().gte(-90).lte(90)])).min(3).max(200),
  }),
]);

export type GeofenceInput = z.input<typeof geofenceInput>;

export async function saveGeofence(input: GeofenceInput): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const p = geofenceInput.safeParse(input);
  if (!p.success) return { error: p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  const g = p.data;
  const { data, error } = await supabase.rpc("upsert_geofence", {
    p_id: g.id,
    p_name: g.name,
    p_kind: g.kind,
    p_center_lat: g.kind === "circle" ? g.center.lat : null,
    p_center_lng: g.kind === "circle" ? g.center.lng : null,
    p_radius_m: g.kind === "circle" ? g.radius_m : null,
    p_ring: g.kind === "polygon" ? g.ring : null,
    p_color: g.color,
    p_icon: null,
    p_is_active: true,
    p_address: g.address ?? null,
  });
  if (error) return { error: error.message };
  revalidatePath("/geofences");
  revalidatePath("/dashboard");
  return { id: data as string, message: "Place saved." };
}

export async function deleteGeofence(id: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  await supabase.rpc("audit", { p_action: "geofence.delete", p_table: "geofences", p_target: id });
  const { error } = await supabase.from("geofences").delete().eq("id", id).eq("owner_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/geofences");
  revalidatePath("/dashboard");
  return { message: "Place deleted." };
}

export async function setGeofenceAssignment(
  geofenceId: string,
  assetId: string,
  opts: { assigned: boolean; notifyOnEnter?: boolean; notifyOnExit?: boolean },
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!opts.assigned) {
    const { error } = await supabase.from("geofence_assets").delete().eq("geofence_id", geofenceId).eq("asset_id", assetId).eq("owner_id", user.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("geofence_assets").upsert({
      geofence_id: geofenceId,
      asset_id: assetId,
      owner_id: user.id,
      notify_on_enter: opts.notifyOnEnter ?? true,
      notify_on_exit: opts.notifyOnExit ?? true,
    });
    if (error) return { error: error.message };
  }
  revalidatePath("/geofences");
  revalidatePath(`/assets/${assetId}`);
  return { message: opts.assigned ? "Asset assigned." : "Asset unassigned." };
}

export async function setHomeGeofence(geofenceId: string | null): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("profiles").update({ home_geofence_id: geofenceId }).eq("id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/geofences");
  return { message: geofenceId ? "Home geofence set." : "Home geofence cleared." };
}
