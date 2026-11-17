import * as React from "react";
import type { VoidedEmailProps } from "./types";
import { Layout, Message, Muted } from "./components/layout";

export function subject(p: VoidedEmailProps): string {
  return `Voided: ${p.subject}`;
}

export default function VoidedEmail(p: VoidedEmailProps) {
  return (
    <Layout
      appUrl={p.appUrl}
      envelopeId={p.envelopeId}
      preview={`${p.senderName} voided ${p.subject}`}
      icon="x"
      title={<>{p.senderName} voided this envelope</>}
      questionsTo={{ name: p.senderName, email: p.senderEmail }}
    >
      <Muted>Hi {p.recipientName.split(/\s+/)[0] || p.recipientName},</Muted>
      <Muted>
        <strong style={{ color: "#141414" }}>{p.subject}</strong> was voided by {p.senderName} ({p.senderEmail}). The documents can no longer be viewed or signed, and any links you received for it have stopped working.
      </Muted>
      <Message text={p.reason || "No reason was given."} label="Reason" />
    </Layout>
  );
}
