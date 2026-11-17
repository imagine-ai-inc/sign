import * as React from "react";
import type { DeclinedEmailProps } from "./types";
import { Layout, Message, Muted } from "./components/layout";

export function subject(p: DeclinedEmailProps): string {
  return `Declined: ${p.subject}`;
}

export default function DeclinedEmail(p: DeclinedEmailProps) {
  return (
    <Layout
      appUrl={p.appUrl}
      envelopeId={p.envelopeId}
      preview={`${p.declinerName} declined to sign ${p.subject}`}
      icon="x"
      title={<>{p.declinerName} declined to sign</>}
      cta={p.url ? { label: "View envelope", href: p.url } : undefined}
    >
      <Muted>Hi {p.recipientName.split(/\s+/)[0] || p.recipientName},</Muted>
      <Muted>
        {p.declinerName} ({p.declinerEmail}) declined to sign <strong style={{ color: "#141414" }}>{p.subject}</strong>. The envelope is closed and no further action is needed from you.
      </Muted>
      <Message text={p.reason || "No reason was given."} label="Reason for declining" />
    </Layout>
  );
}
