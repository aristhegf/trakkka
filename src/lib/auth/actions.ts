"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export interface AuthResult {
  error?: string;
  message?: string;
}

const emailSchema = z.string().trim().email().max(254);
const passwordSchema = z.string().min(8, "Password must be at least 8 characters").max(128);

async function siteUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

function safeNext(next: unknown): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

export async function signInWithPassword(_prev: AuthResult | undefined, formData: FormData): Promise<AuthResult> {
  const email = emailSchema.safeParse(formData.get("email"));
  const password = z.string().min(1).safeParse(formData.get("password"));
  if (!email.success || !password.success) return { error: "Enter a valid email and password." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: email.data, password: password.data });
  if (error) return { error: "Email or password is incorrect." };
  redirect(safeNext(formData.get("next")));
}

export async function signUpWithPassword(_prev: AuthResult | undefined, formData: FormData): Promise<AuthResult> {
  const email = emailSchema.safeParse(formData.get("email"));
  const password = passwordSchema.safeParse(formData.get("password"));
  const name = z.string().trim().max(80).safeParse(formData.get("name") ?? "");
  if (!email.success) return { error: "Enter a valid email." };
  if (!password.success) return { error: password.error.issues[0]?.message ?? "Invalid password." };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: email.data,
    password: password.data,
    options: {
      emailRedirectTo: `${await siteUrl()}/auth/confirm`,
      data: { full_name: name.success ? name.data : undefined },
    },
  });
  if (error) return { error: error.message };
  if (data.session) redirect("/dashboard");
  return { message: "Check your inbox to confirm your email, then sign in." };
}

export async function signInWithGoogle(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const next = safeNext(formData.get("next"));
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${await siteUrl()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) redirect("/login?error=oauth");
  redirect(data.url);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "global" });
  redirect("/login");
}

export async function requestPasswordReset(_prev: AuthResult | undefined, formData: FormData): Promise<AuthResult> {
  const email = emailSchema.safeParse(formData.get("email"));
  if (!email.success) return { error: "Enter a valid email." };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email.data, { redirectTo: `${await siteUrl()}/auth/confirm?next=/update-password` });
  // Always the same message: do not reveal whether the address exists.
  return { message: "If that address has an account, a reset link is on its way." };
}

export async function updatePassword(_prev: AuthResult | undefined, formData: FormData): Promise<AuthResult> {
  const password = passwordSchema.safeParse(formData.get("password"));
  if (!password.success) return { error: password.error.issues[0]?.message ?? "Invalid password." };
  if (formData.get("confirm") !== password.data) return { error: "Passwords do not match." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: password.data });
  if (error) return { error: error.message };
  return { message: "Password updated." };
}

export async function deleteAccount(_prev: AuthResult | undefined, formData: FormData): Promise<AuthResult> {
  if (formData.get("confirm") !== "DELETE") return { error: "Type DELETE to confirm." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_my_account");
  if (error) return { error: error.message };
  await supabase.auth.signOut({ scope: "global" });
  redirect("/login?deleted=1");
}
