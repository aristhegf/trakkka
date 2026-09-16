import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let admin: SupabaseClient | undefined;

/**
 * Service-role client. Bypasses RLS. Server only; never import from a client component.
 * Used exclusively by the ingest pipeline, the notification dispatcher and the simulator seed.
 */
export function createAdminClient(): SupabaseClient {
  if (admin) return admin;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}
