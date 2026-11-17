import "server-only";
import { sql } from "@/lib/db";
import { appendEvent } from "@/lib/audit";
import type { RequestMeta } from "@/lib/request-meta";
import type { Envelope, Recipient } from "@/lib/types";

const ACTION = ["signer", "approver", "viewer"];

/**
 * Moves the envelope forward: emails the next routing group, or completes the
 * envelope when every signer / approver / viewer is done. Safe to call repeatedly.
 */
export async function activateRouting(envelopeId: string, meta: RequestMeta | null) {
  const toNotify: string[] = [];
  let complete = false;
  await sql.begin(async (tx) => {
    const [env] = await tx<Envelope[]>`select * from sign.envelopes where id = ${envelopeId} for update`;
    if (!env || env.status !== "sent") return;
    const recs = await tx<Recipient[]>`select * from sign.recipients where envelope_id = ${envelopeId} and status <> 'replaced' order by routing_order, position`;
    const pending = recs.filter((r) => ACTION.includes(r.role) && r.status !== "completed" && r.status !== "declined");
    if (!pending.length) {
      complete = true;
      return;
    }
    const minOrder = Math.min(...pending.map((r) => r.routingOrder));
    for (const r of pending.filter((r) => r.routingOrder === minOrder && r.status === "created")) {
      await tx`update sign.recipients set status = 'sent', sent_at = now(), updated_at = now() where id = ${r.id}`;
      await appendEvent(tx, { envelopeId, recipientId: r.id, type: "recipient.sent", description: `Sent to ${r.name} (${r.email})`, meta: null, data: { routingOrder: r.routingOrder } });
      toNotify.push(r.id);
    }
  });
  void meta;
  if (toNotify.length) {
    const { sendSigningRequest } = await import("@/lib/services/notify");
    for (const id of toNotify) await sendSigningRequest(envelopeId, id).catch((e) => console.error("[imagine-sign] signing request email failed", envelopeId, id, e));
  }
  if (complete) {
    const { completeEnvelope } = await import("@/lib/services/completion");
    await completeEnvelope(envelopeId);
  }
}
