import * as React from "react";
import type { ActivityEmailProps } from "./types";
import { Layout, Message, Muted } from "./components/layout";

const VERB: Record<ActivityEmailProps["activity"], string> = {
  viewed: "viewed",
  signed: "signed",
  approved: "approved",
  reassigned: "reassigned",
  bounced: "could not be delivered to",
};
const ICON = { viewed: "eye", signed: "check", approved: "check", reassigned: "doc", bounced: "x" } as const;

export function subject(p: ActivityEmailProps): string {
  if (p.activity === "bounced") return `Delivery failed: ${p.actorEmail} (${p.subject})`;
  return `${p.actorName} ${VERB[p.activity]} ${p.subject}`;
}

export default function ActivityEmail(p: ActivityEmailProps) {
  const title = p.activity === "bounced"
    ? <>Your envelope could not be delivered to {p.actorName || p.actorEmail}</>
    : p.activity === "reassigned"
      ? <>{p.actorName} reassigned the envelope</>
      : <>{p.actorName} {VERB[p.activity]} your envelope</>;
  return (
    <Layout
      appUrl={p.appUrl}
      envelopeId={p.envelopeId}
      preview={subject(p)}
      icon={ICON[p.activity]}
      title={title}
      cta={{ label: "View envelope", href: p.url }}
    >
      <Muted>Hi {p.recipientName.split(/\s+/)[0] || p.recipientName},</Muted>
      <Muted>
        {p.activity === "bounced"
          ? <>The email for <strong style={{ color: "#141414" }}>{p.subject}</strong> to {p.actorEmail} bounced. Check the address, then correct the recipient and resend.</>
          : <>{p.actorName} ({p.actorEmail}) {VERB[p.activity]} <strong style={{ color: "#141414" }}>{p.subject}</strong>.</>}
      </Muted>
      <Message text={p.detail} label="Details" />
    </Layout>
  );
}
