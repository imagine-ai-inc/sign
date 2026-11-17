/**
 * Render every email template with sample props to static HTML for review.
 *   pnpm tsx emails/preview.tsx [outDir]
 * Default outDir: ./emails-preview
 * Also writes index.html (all templates with subjects) and <name>.txt (plain-text part).
 */
import * as React from "react";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { render } from "@react-email/render";

import SigningRequest, { subject as sSigning } from "./signing-request";
import Completed, { subject as sCompleted } from "./completed";
import Declined, { subject as sDeclined } from "./declined";
import Voided, { subject as sVoided } from "./voided";
import Activity, { subject as sActivity } from "./activity";
import Comment, { subject as sComment } from "./comment";
import Expiring, { subject as sExpiring } from "./expiring";
import LoginCode, { subject as sLogin } from "./login-code";
import type {
  ActivityEmailProps, CommentEmailProps, CompletedEmailProps, DeclinedEmailProps, ExpiringEmailProps,
  LoginCodeEmailProps, SigningRequestEmailProps, VoidedEmailProps,
} from "./types";

const appUrl = process.env.APP_URL || "http://localhost:3000";
const envelopeId = "8B0C6A52-3F7E-4F55-9D0B-2A51A0C1B9E1";
const base = { appUrl, envelopeId };
const subj = "Acme Corp x Example Co - SaaS Services Order Form";
const docs = ["Acme Corp x Example Co - SaaS Services Order Form.pdf"];

const signing: SigningRequestEmailProps = {
  ...base, senderName: "Alex Sender", senderEmail: "sender@example.com", recipientName: "Jane Doe", subject: subj,
  message: "Hi Jane,\n\nHere's the order form we went over on the call. Let me know if anything looks off.\n\nAlex",
  privateMessage: null, documentNames: docs, action: "sign", url: `${appUrl}/s/tok_sample`, expiresAt: "2027-02-03T18:00:00Z",
};

export const samples: Array<{ name: string; subject: string; el: React.ReactElement }> = [
  { name: "signing-request", subject: sSigning(signing), el: <SigningRequest {...signing} /> },
  { name: "signing-request-reminder", subject: sSigning({ ...signing, isReminder: true }), el: <SigningRequest {...signing} isReminder /> },
  { name: "signing-request-correction", subject: sSigning({ ...signing, isCorrection: true, privateMessage: "Fixed the start date to Oct 15." }), el: <SigningRequest {...signing} isCorrection privateMessage="Fixed the start date to Oct 15." /> },
  { name: "signing-request-view", subject: sSigning({ ...signing, action: "view", message: "" }), el: <SigningRequest {...signing} action="view" message="" recipientName="Casey Copy" /> },
  ...(() => {
    const p: CompletedEmailProps = { ...base, recipientName: "Jane Doe", senderName: "Alex Sender", subject: subj, documentNames: docs, url: `${appUrl}/s/tok_sample/completed`, completedAt: "2026-10-06T19:12:44Z", hasAttachment: true };
    return [{ name: "completed", subject: sCompleted(p), el: <Completed {...p} /> }];
  })(),
  ...(() => {
    const p: DeclinedEmailProps = { ...base, recipientName: "Alex Sender", declinerName: "Jane Doe", declinerEmail: "jane@example.com", reason: "Our legal team needs to review the auto-renewal clause first.", subject: subj, url: `${appUrl}/envelopes/${envelopeId}` };
    return [{ name: "declined", subject: sDeclined(p), el: <Declined {...p} /> }];
  })(),
  ...(() => {
    const p: VoidedEmailProps = { ...base, recipientName: "Jane Doe", senderName: "Alex Sender", senderEmail: "sender@example.com", subject: subj, reason: "Sending a corrected version with the new seat count." };
    return [{ name: "voided", subject: sVoided(p), el: <Voided {...p} /> }];
  })(),
  ...(["viewed", "signed", "reassigned", "bounced"] as const).map((activity) => {
    const p: ActivityEmailProps = { ...base, recipientName: "Alex Sender", actorName: "Jane Doe", actorEmail: "jane@example.com", activity, subject: subj, url: `${appUrl}/envelopes/${envelopeId}`, detail: activity === "reassigned" ? "Reassigned to Mark Lee (mark@example.com): \"Mark signs contracts for us.\"" : null };
    return { name: `activity-${activity}`, subject: sActivity(p), el: <Activity {...p} /> };
  }),
  ...(() => {
    const p: CommentEmailProps = { ...base, recipientName: "Casey Copy", authorName: "Alex Sender", body: "Jane asked for net-45 instead of net-30. I'm ok with it, can you update the template?", subject: subj, url: `${appUrl}/envelopes/${envelopeId}#comments` };
    return [{ name: "comment", subject: sComment(p), el: <Comment {...p} /> }];
  })(),
  ...(() => {
    const p: ExpiringEmailProps = { ...base, recipientName: "Jane Doe", senderName: "Alex Sender", subject: subj, url: `${appUrl}/s/tok_sample`, expiresAt: "2026-10-09T18:00:00Z" };
    return [{ name: "expiring", subject: sExpiring(p), el: <Expiring {...p} /> }];
  })(),
  ...(() => {
    const p: LoginCodeEmailProps = { appUrl, code: "482913" };
    return [{ name: "login-code", subject: sLogin(p), el: <LoginCode {...p} /> }];
  })(),
];

async function main() {
  const out = process.argv[2] ?? "./emails-preview";
  mkdirSync(out, { recursive: true });
  const rows: string[] = [];
  for (const s of samples) {
    const html = await render(s.el);
    const text = await render(s.el, { plainText: true });
    writeFileSync(join(out, `${s.name}.html`), html);
    writeFileSync(join(out, `${s.name}.txt`), `Subject: ${s.subject}\n\n${text}`);
    rows.push(`<li><a href="${s.name}.html">${s.name}</a> <span style="color:#77706D">${s.subject.replace(/</g, "&lt;")}</span></li>`);
    console.log(`${s.name}.html  ${s.subject}`);
  }
  writeFileSync(join(out, "index.html"), `<!doctype html><meta charset="utf-8"><title>Imagine Sign emails</title><body style="font-family:Inter,Helvetica,sans-serif;background:#F4F1EF;padding:32px"><h1 style="font-weight:400">Imagine Sign emails</h1><ul style="line-height:2">${rows.join("")}</ul></body>`);
}

if (process.argv[1]?.includes("preview")) main().catch((e) => { console.error(e); process.exit(1); });
