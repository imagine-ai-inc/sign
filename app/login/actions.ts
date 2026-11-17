"use server";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { env } from "@/lib/env";
import { brand } from "@/lib/brand";
import { supabaseServer } from "@/lib/supabase/server";
import { bootstrapOwner } from "@/lib/services/bootstrap";
import { sendLoginCodeViaResend } from "@/lib/email/login-code";

export type LoginState = { step: "email" | "code"; email?: string; error?: string; next?: string };

export async function requestCode(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") || "").trim().toLowerCase();
  const next = String(form.get("next") || "/");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { step: "email", error: "Enter a valid email", next };
  let [u] = await sql<{ status: string }[]>`select status from sign.users where lower(email) = ${email} limit 1`;
  if (!u && (await bootstrapOwner(email))) [u] = await sql<{ status: string }[]>`select status from sign.users where lower(email) = ${email} limit 1`;
  if (!u || u.status === "disabled") return { step: "email", email, next, error: `This email doesn't have access to ${brand.name}. Ask an admin to invite you.` };
  if (env.resendKey() && env.emailFrom()) {
    const err = await sendLoginCodeViaResend(email);
    if (err) return { step: "email", email, next, error: err };
    return { step: "code", email, next };
  }
  // No Resend configured: fall back to Supabase's own mailer (its "Magic Link" template must include {{ .Token }}).
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) return { step: "email", email, next, error: error.message };
  return { step: "code", email, next };
}

export async function verifyCode(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") || "").trim().toLowerCase();
  const code = String(form.get("code") || "").replace(/\s/g, "");
  const next = String(form.get("next") || "/");
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
  if (error || !data.user) return { step: "code", email, next, error: "That code didn't work. Check the latest email and try again." };
  await sql`update sign.users set auth_user_id = ${data.user.id}, status = 'active', last_seen_at = now() where lower(email) = ${email} and status <> 'disabled'`;
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}
