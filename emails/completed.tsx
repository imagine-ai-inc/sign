import * as React from "react";
import type { CompletedEmailProps } from "./types";
import { DocList, Layout, Muted, fmtDate } from "./components/layout";

export function subject(p: CompletedEmailProps): string {
  return `Completed: ${p.subject || p.documentNames[0] || "your document"}`;
}

export default function CompletedEmail(p: CompletedEmailProps) {
  return (
    <Layout
      appUrl={p.appUrl}
      envelopeId={p.envelopeId}
      preview={`All parties have completed ${p.subject}`}
      icon="check"
      title={<>Your document has been completed</>}
      cta={{ label: "View completed document", href: p.url }}
      panelNote={<>All parties finished on {fmtDate(p.completedAt)}.</>}
    >
      <Muted>Hi {p.recipientName.split(/\s+/)[0] || p.recipientName},</Muted>
      <Muted>
        All parties have completed <strong style={{ color: "#141414" }}>{p.subject}</strong>, sent by {p.senderName}.
        {p.hasAttachment
          ? " The signed PDF, including the Certificate of Completion, is attached to this email for your records."
          : " You can view and download the signed PDF, including the Certificate of Completion, from the link above."}
      </Muted>
      <DocList names={p.documentNames} />
      <Muted>The completed file is digitally sealed. Any change made to it after signing can be detected.</Muted>
    </Layout>
  );
}
