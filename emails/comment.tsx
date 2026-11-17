import { brand } from "../lib/brand";
import * as React from "react";
import type { CommentEmailProps } from "./types";
import { Layout, Message, Muted } from "./components/layout";

export function subject(p: CommentEmailProps): string {
  return `New comment on ${p.subject}`;
}

export default function CommentEmail(p: CommentEmailProps) {
  return (
    <Layout
      appUrl={p.appUrl}
      envelopeId={p.envelopeId}
      preview={`${p.authorName}: ${p.body.slice(0, 90)}`}
      icon="bubble"
      title={<>{p.authorName} commented on {p.subject}</>}
      cta={{ label: `Reply in ${brand.name}`, href: p.url }}
    >
      <Muted>Hi {p.recipientName.split(/\s+/)[0] || p.recipientName},</Muted>
      <Message text={p.body} label={p.authorName} />
    </Layout>
  );
}
