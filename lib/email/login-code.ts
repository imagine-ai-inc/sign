import "server-only";
import * as React from "react";
import { render } from "@react-email/render";
import { Resend } from "resend";
import { env } from "@/lib/env";
import LoginCodeEmail, { subject as loginSubject } from "@/emails/login-code";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Sends the 6-digit login code through Resend instead of Supabase's mailer, so a self-hosted
 * install needs no Supabase SMTP setup. The code comes from the Supabase Admin API and is verified
 * with the normal supabase.auth.verifyOtp({ type: "email" }). Not logged to sign.emails (it's a secret).
 * Returns null on success, or an error message.
 */
export async function sendLoginCodeViaResend(email: string): Promise<string | null> {
  const admin = supabaseAdmin().auth.admin;
  let { data, error } = await admin.generateLink({ type: "magiclink", email });
  if (error) {
    // first login: the Supabase auth user doesn't exist yet
    await admin.createUser({ email, email_confirm: true }).catch(() => null);
    ({ data, error } = await admin.generateLink({ type: "magiclink", email }));
  }
  const code = data?.properties?.email_otp;
  if (error || !code) return error?.message || "Could not create a login code";
  const props = { appUrl: env.appUrl(), code };
  const el = React.createElement(LoginCodeEmail, props);
  const resend = new Resend(env.resendKey());
  const res = await resend.emails.send({
    from: `${env.emailFromName().replace(/[<>"]/g, "")} <${env.emailFrom()}>`,
    to: [email],
    subject: loginSubject(props),
    html: await render(el),
    text: await render(el, { plainText: true }),
    tags: [{ name: "type", value: "login_code" }],
  });
  return res.error ? res.error.message : null;
}
