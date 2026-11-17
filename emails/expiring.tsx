import * as React from "react";
import type { ExpiringEmailProps } from "./types";
import { Layout, Muted, fmtDate } from "./components/layout";

export function subject(p: ExpiringEmailProps): string {
  return `Expiring soon: ${p.subject}`;
}

export default function ExpiringEmail(p: ExpiringEmailProps) {
  return (
    <Layout
      appUrl={p.appUrl}
      envelopeId={p.envelopeId}
      preview={`${p.subject} expires on ${fmtDate(p.expiresAt)}`}
      icon="clock"
      title={<>This envelope expires soon</>}
      cta={{ label: "Review document", href: p.url }}
      panelNote={<>Expires on {fmtDate(p.expiresAt)}.</>}
      signingFooter
    >
      <Muted>Hi {p.recipientName.split(/\s+/)[0] || p.recipientName},</Muted>
      <Muted>
        {p.senderName} is still waiting on you for <strong style={{ color: "#141414" }}>{p.subject}</strong>. After it expires the link stops working and {p.senderName} will need to send it again.
      </Muted>
    </Layout>
  );
}
