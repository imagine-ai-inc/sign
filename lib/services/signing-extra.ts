import { brand } from "@/lib/brand";
import "server-only";
import { sql } from "@/lib/db";
import { appendEvent } from "@/lib/audit";
import { storeFile } from "@/lib/storage";
import { safeEqual } from "@/lib/crypto";
import type { RequestMeta } from "@/lib/request-meta";
import type { SignatureAdoption } from "@/lib/types";
import { AppError } from "@/lib/services/access";
import { accessCookieValue, resolveToken } from "@/lib/services/signing";

export interface SignerHistoryRow { at: string; user: string; action: string; activity: string }

const LABELS: Record<string, string> = {
  "envelope.created": "Created", "envelope.sent": "Sent", "recipient.sent": "Sent", "recipient.viewed": "Viewed", "recipient.consented": "Consent",
  "recipient.signature_adopted": "Signature adopted", "recipient.signed": "Signed", "recipient.approved": "Approved", "recipient.acknowledged": "Viewed",
  "recipient.declined": "Declined", "recipient.reassigned": "Reassigned", "envelope.completed": "Completed", "envelope.voided": "Voided",
  "envelope.corrected": "Corrected", "envelope.resent": "Resent", "reminder.sent": "Reminder", "recipient.authenticated": "Authenticated",
  "recipient.auth_failed": "Authentication failed", "recipient.copy_sent": "Copy sent", "envelope.expired": "Expired", "envelope.from_template": "Created",
};

/** Envelope history as a signer may see it (no internal team notes). */
export async function signerHistory(token: string): Promise<SignerHistoryRow[]> {
  const resolved = await resolveToken(token);
  if (!resolved) throw new AppError("invalid_link", "This link is no longer valid", 404);
  const rows = await sql<{ createdAt: Date; type: string; description: string; actorName: string | null; recipientName: string | null; senderName: string | null }[]>`
    select e.created_at, e.type, e.description, u.name as actor_name, r.name as recipient_name, env.sender_name
    from sign.events e
    left join sign.users u on u.id = e.actor_user_id
    left join sign.recipients r on r.id = e.recipient_id
    join sign.envelopes env on env.id = e.envelope_id
    where e.envelope_id = ${resolved.envelope.id} and e.type not like 'comment.%'
    order by e.id`;
  return rows.map((e) => ({
    at: new Date(e.createdAt).toISOString(),
    user: e.recipientName || e.actorName || e.senderName || brand.name,
    action: LABELS[e.type] ?? e.type.replace(/^[a-z]+\./, "").replace(/_/g, " "),
    activity: e.description,
  }));
}

function decodePng(dataUrl: string): Uint8Array {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || "");
  if (!m) throw new AppError("bad_image", "Stamp image must be a PNG");
  const bytes = new Uint8Array(Buffer.from(m[1], "base64"));
  if (bytes.byteLength > 2_000_000) throw new AppError("image_too_large", "Stamp image is too large");
  return bytes;
}

/** Adopt a company stamp image for a recipient who already adopted a signature. */
export async function adoptStamp(token: string, stampPng: string, meta: RequestMeta, accessCookie?: string | null): Promise<void> {
  const resolved = await resolveToken(token);
  if (!resolved || resolved.revoked) throw new AppError("invalid_link", "This link is no longer valid", 404);
  const { recipient, envelope } = resolved;
  if (recipient.accessCodeHash && !(accessCookie && safeEqual(accessCookie, accessCookieValue(recipient.id)))) throw new AppError("access_code_required", "Enter the access code first", 401);
  if (envelope.status !== "sent" || (recipient.status !== "sent" && recipient.status !== "delivered")) throw new AppError("not_active", "This envelope isn't waiting on you right now", 409);
  const base = recipient.signatureAdoption;
  if (!base) throw new AppError("signature_required", "Adopt your signature first");
  const bytes = decodePng(stampPng);
  const file = await storeFile(sql, { workspaceId: envelope.workspaceId, path: `envelopes/${envelope.id}/signatures/${recipient.id}-${Date.now()}-stamp.png`, filename: "stamp.png", contentType: "image/png", bytes, kind: "signature" });
  const adoption: SignatureAdoption = { ...base, stampFileId: file.id };
  await sql`update sign.recipients set signature_adoption = ${sql.json(adoption as never)}, updated_at = now() where id = ${recipient.id}`;
  await appendEvent(sql, { envelopeId: envelope.id, recipientId: recipient.id, type: "recipient.stamp_adopted", description: `${recipient.name} adopted a stamp`, meta });
}
