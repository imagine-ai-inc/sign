import { brand } from "@/lib/brand";
import "server-only";
import * as React from "react";
import { render } from "@react-email/render";
import { Resend } from "resend";
import { sql } from "@/lib/db";
import { env } from "@/lib/env";
import SigningRequestEmail, { subject as signingSubject } from "@/emails/signing-request";
import CompletedEmail, { subject as completedSubject } from "@/emails/completed";
import DeclinedEmail, { subject as declinedSubject } from "@/emails/declined";
import VoidedEmail, { subject as voidedSubject } from "@/emails/voided";
import ActivityEmail, { subject as activitySubject } from "@/emails/activity";
import CommentEmail, { subject as commentSubject } from "@/emails/comment";
import ExpiringEmail, { subject as expiringSubject } from "@/emails/expiring";
import type {
  SigningRequestEmailProps, CompletedEmailProps, DeclinedEmailProps, VoidedEmailProps,
  ActivityEmailProps, CommentEmailProps, ExpiringEmailProps,
} from "@/emails/types";

type Kind =
  | { kind: "signing_request"; props: SigningRequestEmailProps }
  | { kind: "completed"; props: CompletedEmailProps }
  | { kind: "declined"; props: DeclinedEmailProps }
  | { kind: "voided"; props: VoidedEmailProps }
  | { kind: "activity"; props: ActivityEmailProps }
  | { kind: "comment"; props: CommentEmailProps }
  | { kind: "expiring"; props: ExpiringEmailProps };

export interface SendOptions {
  to: string;
  senderName?: string | null; // shown as "<Sender> via <brand name>"
  replyTo?: string | null;
  envelopeId?: string | null;
  recipientId?: string | null;
  attachments?: { filename: string; content: Uint8Array }[];
}

let resend: Resend | null = null;
function client() {
  if (!resend) resend = new Resend(env.resendKey());
  return resend;
}

function build(k: Kind): { subject: string; el: React.ReactElement } {
  switch (k.kind) {
    case "signing_request": return { subject: signingSubject(k.props), el: React.createElement(SigningRequestEmail, k.props) };
    case "completed": return { subject: completedSubject(k.props), el: React.createElement(CompletedEmail, k.props) };
    case "declined": return { subject: declinedSubject(k.props), el: React.createElement(DeclinedEmail, k.props) };
    case "voided": return { subject: voidedSubject(k.props), el: React.createElement(VoidedEmail, k.props) };
    case "activity": return { subject: activitySubject(k.props), el: React.createElement(ActivityEmail, k.props) };
    case "comment": return { subject: commentSubject(k.props), el: React.createElement(CommentEmail, k.props) };
    case "expiring": return { subject: expiringSubject(k.props), el: React.createElement(ExpiringEmail, k.props) };
  }
}

export async function sendEmail(k: Kind, o: SendOptions): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { subject, el } = build(k);
  const html = await render(el);
  const text = await render(el, { plainText: true });
  const fromName = (o.senderName ? `${o.senderName} via ${brand.name}` : env.emailFromName()).replace(/[<>"]/g, "");
  const [log] = await sql<{ id: string }[]>`
    insert into sign.emails (envelope_id, recipient_id, type, to_email, subject, status)
    values (${o.envelopeId ?? null}, ${o.recipientId ?? null}, ${k.kind}, ${o.to}, ${subject}, 'queued') returning id`;
  if (!env.resendKey() || !env.emailFrom()) {
    const missing = !env.resendKey() ? "RESEND_API_KEY missing" : "EMAIL_FROM_ADDRESS missing";
    await sql`update sign.emails set status = 'failed', error = ${missing}, updated_at = now() where id = ${log.id}`;
    return { ok: false, error: missing };
  }
  try {
    const res = await client().emails.send({
      from: `${fromName} <${env.emailFrom()}>`,
      to: [o.to],
      subject,
      html,
      text,
      replyTo: o.replyTo || undefined,
      attachments: o.attachments?.map((a) => ({ filename: a.filename, content: Buffer.from(a.content) })),
      headers: o.envelopeId ? { "X-Imagine-Envelope-Id": o.envelopeId } : undefined,
      tags: [{ name: "type", value: k.kind }],
    });
    if (res.error) throw new Error(res.error.message);
    await sql`update sign.emails set status = 'sent', resend_id = ${res.data?.id ?? null}, updated_at = now() where id = ${log.id}`;
    return { ok: true, id: res.data?.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sql`update sign.emails set status = 'failed', error = ${msg}, updated_at = now() where id = ${log.id}`;
    return { ok: false, error: msg };
  }
}
