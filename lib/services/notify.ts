import { brand } from "@/lib/brand";
import "server-only";
import { sql } from "@/lib/db";
import { env } from "@/lib/env";
import { randomToken, hashSecret } from "@/lib/crypto";
import { sendEmail } from "@/lib/email/send";
import { envelopeIdDisplay } from "@/lib/format";
import type { AppUser, Envelope, Recipient } from "@/lib/types";

async function envelopeContext(envelopeId: string) {
  const [envelope] = await sql<Envelope[]>`select * from sign.envelopes where id = ${envelopeId}`;
  const docs = await sql<{ name: string }[]>`select name from sign.documents where envelope_id = ${envelopeId} order by position`;
  const [owner] = await sql<{ name: string; email: string; notificationPrefs: Record<string, boolean> }[]>`select name, email, notification_prefs from sign.users where id = ${envelope.ownerId}`;
  return {
    envelope,
    documentNames: docs.map((d) => `${d.name}.pdf`),
    senderName: envelope.senderName || owner?.name || brand.company || brand.name,
    senderEmail: envelope.senderEmail || owner?.email || env.emailFrom(),
    owner,
  };
}

/** Issues a new signing link for a recipient. Old links keep working until the envelope closes. */
export async function issueSigningToken(recipientId: string, expiresAt: Date | null): Promise<string> {
  const token = randomToken(32);
  await sql`insert into sign.signing_tokens (token_hash, recipient_id, purpose, expires_at) values (${hashSecret(token)}, ${recipientId}, 'sign', ${expiresAt})`;
  return token;
}

export function signingUrl(token: string) {
  return `${env.appUrl()}/s/${token}`;
}

export async function sendSigningRequest(envelopeId: string, recipientId: string, opts: { reminder?: boolean; correction?: boolean } = {}) {
  const ctx = await envelopeContext(envelopeId);
  const [r] = await sql<Recipient[]>`select * from sign.recipients where id = ${recipientId}`;
  if (!r) return;
  const token = await issueSigningToken(r.id, ctx.envelope.expiresAt);
  const action = r.role === "viewer" ? "view" : r.role === "approver" ? "approve" : "sign";
  const res = await sendEmail(
    {
      kind: "signing_request",
      props: {
        appUrl: env.appUrl(),
        envelopeId: envelopeIdDisplay(envelopeId),
        senderName: ctx.senderName,
        senderEmail: ctx.senderEmail,
        recipientName: r.name,
        subject: ctx.envelope.subject,
        message: ctx.envelope.message,
        privateMessage: r.privateMessage,
        documentNames: ctx.documentNames,
        action,
        url: signingUrl(token),
        expiresAt: ctx.envelope.expiresAt ? new Date(ctx.envelope.expiresAt).toISOString() : null,
        isReminder: !!opts.reminder,
        isCorrection: !!opts.correction,
      },
    },
    { to: r.email, senderName: ctx.senderName, replyTo: ctx.senderEmail, envelopeId, recipientId: r.id },
  );
  return { token, ...res };
}

export async function notifyActivity(envelopeId: string, actor: { name: string; email: string }, activity: "viewed" | "signed" | "approved" | "reassigned" | "bounced", detail?: string | null) {
  const ctx = await envelopeContext(envelopeId);
  if (!ctx.owner) return;
  const prefs = ctx.owner.notificationPrefs || {};
  if (activity === "viewed" && prefs.viewed !== true) return; // off by default, like DocuSign
  if (activity !== "viewed" && prefs[activity] === false) return;
  await sendEmail(
    {
      kind: "activity",
      props: {
        appUrl: env.appUrl(), envelopeId: envelopeIdDisplay(envelopeId), recipientName: ctx.owner.name,
        actorName: actor.name, actorEmail: actor.email, activity, subject: ctx.envelope.subject,
        url: `${env.appUrl()}/agreements/${envelopeId}`, detail: detail ?? null,
      },
    },
    { to: ctx.owner.email, envelopeId },
  );
}

export async function notifyDeclined(envelopeId: string, decliner: Recipient, reason: string) {
  const ctx = await envelopeContext(envelopeId);
  const targets = new Map<string, string>();
  if (ctx.owner) targets.set(ctx.owner.email, ctx.owner.name);
  const others = await sql<Recipient[]>`select * from sign.recipients where envelope_id = ${envelopeId} and id <> ${decliner.id} and status in ('sent','delivered','completed')`;
  for (const o of others) if (!targets.has(o.email)) targets.set(o.email, o.name);
  for (const [email, name] of targets) {
    const internal = email === ctx.owner?.email;
    await sendEmail(
      {
        kind: "declined",
        props: {
          appUrl: env.appUrl(), envelopeId: envelopeIdDisplay(envelopeId), recipientName: name,
          declinerName: decliner.name, declinerEmail: decliner.email, reason, subject: ctx.envelope.subject,
          url: internal ? `${env.appUrl()}/agreements/${envelopeId}` : "",
        },
      },
      { to: email, senderName: internal ? null : ctx.senderName, replyTo: internal ? decliner.email : ctx.senderEmail, envelopeId },
    );
  }
}

export async function notifyVoided(envelopeId: string, reason: string) {
  const ctx = await envelopeContext(envelopeId);
  const recs = await sql<Recipient[]>`select * from sign.recipients where envelope_id = ${envelopeId} and status in ('sent','delivered','completed')`;
  for (const r of recs) {
    await sendEmail(
      { kind: "voided", props: { appUrl: env.appUrl(), envelopeId: envelopeIdDisplay(envelopeId), recipientName: r.name, senderName: ctx.senderName, senderEmail: ctx.senderEmail, subject: ctx.envelope.subject, reason } },
      { to: r.email, senderName: ctx.senderName, replyTo: ctx.senderEmail, envelopeId, recipientId: r.id },
    );
  }
}

export async function notifyCompleted(envelopeId: string, attachment: { filename: string; content: Uint8Array } | null) {
  const ctx = await envelopeContext(envelopeId);
  const recs = await sql<Recipient[]>`select * from sign.recipients where envelope_id = ${envelopeId} and status <> 'replaced' and status <> 'declined'`;
  const sent = new Set<string>();
  const small = attachment && attachment.content.byteLength < 20 * 1024 * 1024 ? attachment : null;
  for (const r of recs) {
    if (sent.has(r.email)) continue;
    sent.add(r.email);
    const token = await issueSigningToken(r.id, null);
    await sendEmail(
      {
        kind: "completed",
        props: {
          appUrl: env.appUrl(), envelopeId: envelopeIdDisplay(envelopeId), recipientName: r.name, senderName: ctx.senderName,
          subject: ctx.envelope.subject, documentNames: ctx.documentNames, url: signingUrl(token),
          completedAt: new Date().toISOString(), hasAttachment: !!small,
        },
      },
      { to: r.email, senderName: ctx.senderName, replyTo: ctx.senderEmail, envelopeId, recipientId: r.id, attachments: small ? [small] : undefined },
    );
  }
  if (ctx.owner && !sent.has(ctx.owner.email)) {
    await sendEmail(
      {
        kind: "completed",
        props: {
          appUrl: env.appUrl(), envelopeId: envelopeIdDisplay(envelopeId), recipientName: ctx.owner.name, senderName: ctx.senderName,
          subject: ctx.envelope.subject, documentNames: ctx.documentNames, url: `${env.appUrl()}/agreements/${envelopeId}`,
          completedAt: new Date().toISOString(), hasAttachment: !!small,
        },
      },
      { to: ctx.owner.email, envelopeId, attachments: small ? [small] : undefined },
    );
  }
}

export async function notifyExpiring(envelopeId: string) {
  const ctx = await envelopeContext(envelopeId);
  const recs = await sql<Recipient[]>`select * from sign.recipients where envelope_id = ${envelopeId} and status in ('sent','delivered') and role <> 'cc'`;
  for (const r of recs) {
    const token = await issueSigningToken(r.id, ctx.envelope.expiresAt);
    await sendEmail(
      { kind: "expiring", props: { appUrl: env.appUrl(), envelopeId: envelopeIdDisplay(envelopeId), recipientName: r.name, senderName: ctx.senderName, subject: ctx.envelope.subject, url: signingUrl(token), expiresAt: new Date(ctx.envelope.expiresAt!).toISOString() } },
      { to: r.email, senderName: ctx.senderName, replyTo: ctx.senderEmail, envelopeId, recipientId: r.id },
    );
  }
}

export async function notifyComment(envelopeId: string, author: AppUser, body: string, visibility: "internal" | "everyone") {
  const ctx = await envelopeContext(envelopeId);
  const targets = new Map<string, string>();
  if (ctx.owner && ctx.owner.email !== author.email) targets.set(ctx.owner.email, ctx.owner.name);
  const collaborators = await sql<{ name: string; email: string }[]>`select u.name, u.email from sign.envelope_collaborators c join sign.users u on u.id = c.user_id where c.envelope_id = ${envelopeId}`;
  for (const c of collaborators) if (c.email !== author.email) targets.set(c.email, c.name);
  for (const [email, name] of targets) {
    await sendEmail(
      { kind: "comment", props: { appUrl: env.appUrl(), envelopeId: envelopeIdDisplay(envelopeId), recipientName: name, authorName: author.name, body, subject: ctx.envelope.subject, url: `${env.appUrl()}/agreements/${envelopeId}` } },
      { to: email, envelopeId },
    );
  }
  void visibility;
}
