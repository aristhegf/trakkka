"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export interface ActionResult {
  error?: string;
  message?: string;
}

export async function updateProfile(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  const name = z.string().trim().max(80).safeParse(formData.get("display_name") ?? "");
  const tz = z.string().trim().max(60).safeParse(formData.get("timezone") ?? "Africa/Lagos");
  if (!name.success || !tz.success) return { error: "Invalid input." };
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz.data });
  } catch {
    return { error: "Unknown timezone." };
  }
  const { error } = await supabase.from("profiles").update({ display_name: name.data || null, timezone: tz.data }).eq("id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { message: "Profile saved." };
}
