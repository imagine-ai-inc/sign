import * as React from "react";
import type { SigningRequestEmailProps } from "./types";
import { DocList, Layout, Message, Muted, SenderBlock, fmtDate } from "./components/layout";

const VERB = { sign: "review and sign", view: "review", approve: "review and approve" } as const;
const CTA = { sign: "Review document", view: "View document", approve: "Review document" } as const;

export function subject(p: SigningRequestEmailProps): string {
  const base = p.subject?.trim() || `Please ${VERB[p.action]}: ${p.documentNames[0] ?? "document"}`;
  if (p.isCorrection) return `Corrected: ${base}`;
  return p.isReminder ? `Reminder: ${base}` : base;
}

export default function SigningRequestEmail(p: SigningRequestEmailProps) {
  const docWord = p.documentNames.length === 1 ? "a document" : "documents";
  const title = p.isReminder
    ? <>Reminder: {p.senderName} is waiting for you to {VERB[p.action]} {docWord}.</>
    : p.isCorrection
      ? <>{p.senderName} corrected {docWord} for you to {VERB[p.action]}.</>
      : <>{p.senderName} sent you {docWord} to {VERB[p.action]}.</>;
  return (
    <Layout
      appUrl={p.appUrl}
      envelopeId={p.envelopeId}
      preview={`${p.senderName} sent you ${p.documentNames.join(", ")} to ${VERB[p.action]}`}
      icon="doc"
      title={title}
      cta={{ label: CTA[p.action], href: p.url }}
      panelNote={p.expiresAt ? <>This request expires on {fmtDate(p.expiresAt)}.</> : null}
      signingFooter
      questionsTo={{ name: p.senderName, email: p.senderEmail }}
    >
      <SenderBlock name={p.senderName} email={p.senderEmail} />
      <Message text={p.message || `${p.recipientName ? `Hi ${p.recipientName.split(/\s+/)[0]},\n\n` : ""}Please ${VERB[p.action]} the attached ${p.documentNames.length === 1 ? "document" : "documents"}.`} />
      <Message text={p.privateMessage} label={`Private message for ${p.recipientName}`} />
      <DocList names={p.documentNames} />
      <Muted>The link above is unique to you. Anyone with it can act on your behalf, so please don&apos;t forward this email.</Muted>
    </Layout>
  );
}
