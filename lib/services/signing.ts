import "server-only";
import { sql } from "@/lib/db";
import { appendEvent } from "@/lib/audit";
import { hashSecret, hmacHex, safeEqual } from "@/lib/crypto";
import { env as appEnv } from "@/lib/env";
import { storeFile } from "@/lib/storage";
import { fmtDate, DEFAULT_TZ } from "@/lib/format";
import type { RequestMeta } from "@/lib/request-meta";
import type { Envelope, EnvelopeDocument, Field, Recipient, SignatureAdoption } from "@/lib/types";
import { AppError } from "@/lib/services/access";
import { evaluateFormula, formatFormula } from "@/lib/formula";
import { isFieldActive, validateText } from "@/lib/conditions";

export type SignerState = "active" | "waiting" | "done" | "completed" | "voided" | "declined" | "expired" | "replaced";

export interface SignerSession {
  state: SignerState;
  envelope: Envelope;
  recipient: Recipient;
  documents: EnvelopeDocument[];
  fields: Field[]; // this recipient's fields + other recipients' completed values (read only)
  otherRecipients: Pick<Recipient, "id" | "name" | "email" | "role" | "status" | "routingOrder" | "colorIndex">[];
  needsAccessCode: boolean;
}

export async function resolveToken(token: string): Promise<{ recipient: Recipient; envelope: Envelope; revoked: boolean } | null> {
  if (!token || token.length < 20 || token.length > 100) return null;
  const [row] = await sql<{ recipientId: string; revokedAt: Date | null; expiresAt: Date | null }[]>`
    select recipient_id, revoked_at, expires_at from sign.signing_tokens where token_hash = ${hashSecret(token)}`;
  if (!row) return null;
  const [recipient] = await sql<Recipient[]>`select * from sign.recipients where id = ${row.recipientId}`;
  if (!recipient) return null;
  const [envelope] = await sql<Envelope[]>`select * from sign.envelopes where id = ${recipient.envelopeId}`;
  if (!envelope || envelope.deletedAt && envelope.status === "draft") return null;
  await sql`update sign.signing_tokens set last_used_at = now() where token_hash = ${hashSecret(token)}`;
  return { recipient, envelope, revoked: !!row.revokedAt };
}

export function accessCookieName(recipientId: string) {
  return `isac_${recipientId.replace(/-/g, "").slice(0, 16)}`;
}
export function accessCookieValue(recipientId: string) {
  return hmacHex(appEnv.tokenPepper(), `access:${recipientId}`);
}

export async function loadSignerSession(token: string, accessCookie?: string | null): Promise<SignerSession | null> {
  const resolved = await resolveToken(token);
  if (!resolved) return null;
  const { recipient, envelope } = resolved;
  if (resolved.revoked && !(envelope.status === "voided" || recipient.status === "replaced" || envelope.status === "completed")) return null;
  let state: SignerState;
  if (recipient.status === "replaced") state = "replaced";
  else if (envelope.status === "completed") state = "completed";
  else if (envelope.status === "voided") state = "voided";
  else if (envelope.status === "declined") state = "declined";
  else if (envelope.status === "expired" || (envelope.expiresAt && new Date(envelope.expiresAt) < new Date())) state = "expired";
  else if (recipient.status === "completed") state = "done";
  else if (recipient.status === "created") state = "waiting";
  else state = "active";

  const needsAccessCode = !!recipient.accessCodeHash && !(accessCookie && safeEqual(accessCookie, accessCookieValue(recipient.id)));
  const documents = await sql<EnvelopeDocument[]>`select * from sign.documents where envelope_id = ${envelope.id} order by position`;
  const all = await sql<Field[]>`select * from sign.fields where envelope_id = ${envelope.id}`;
  const recs = await sql<Recipient[]>`select * from sign.recipients where envelope_id = ${envelope.id} and status <> 'replaced' order by routing_order, position`;
  const completedIds = new Set(recs.filter((r) => r.status === "completed").map((r) => r.id));
  const fields = all.filter((f) => f.recipientId === recipient.id || (completedIds.has(f.recipientId) && f.value));
  return {
    state,
    envelope,
    recipient,
    documents,
    fields: needsAccessCode ? [] : fields,
    otherRecipients: recs.filter((r) => r.id !== recipient.id).map((r) => ({ id: r.id, name: r.name, email: r.email, role: r.role, status: r.status, routingOrder: r.routingOrder, colorIndex: r.colorIndex })),
    needsAccessCode,
  };
}

export async function verifyAccessCode(token: string, code: string): Promise<boolean> {
  const resolved = await resolveToken(token);
  if (!resolved?.recipient.accessCodeHash) return false;
  const ok = safeEqual(hashSecret(code.trim().toLowerCase()), resolved.recipient.accessCodeHash);
  await appendEvent(sql, { envelopeId: resolved.envelope.id, recipientId: resolved.recipient.id, type: ok ? "recipient.authenticated" : "recipient.auth_failed", description: ok ? `${resolved.recipient.name} passed the access code check` : `${resolved.recipient.name} entered a wrong access code` });
  return ok;
}

async function requireActive(token: string, accessCookie?: string | null) {
  const resolved = await resolveToken(token);
  if (!resolved || resolved.revoked) throw new AppError("invalid_link", "This link is no longer valid", 404);
  const { recipient, envelope } = resolved;
  if (recipient.accessCodeHash && !(accessCookie && safeEqual(accessCookie, accessCookieValue(recipient.id)))) throw new AppError("access_code_required", "Enter the access code first", 401);
  if (envelope.status !== "sent") throw new AppError("closed", "This envelope is no longer open for signing", 409);
  if (envelope.expiresAt && new Date(envelope.expiresAt) < new Date()) throw new AppError("expired", "This envelope has expired", 409);
  if (recipient.status !== "sent" && recipient.status !== "delivered") throw new AppError("not_active", "This envelope isn't waiting on you right now", 409);
  return resolved;
}

export async function markViewed(token: string, meta: RequestMeta) {
  const resolved = await resolveToken(token);
  if (!resolved) return;
  const { recipient, envelope } = resolved;
  if (envelope.status !== "sent" || recipient.status !== "sent") return;
  const updated = await sql`update sign.recipients set status = 'delivered', delivered_at = now(), ip = ${meta.ip}, user_agent = ${meta.userAgent}, geo = ${meta.geo ? sql.json(meta.geo) : null}, updated_at = now() where id = ${recipient.id} and status = 'sent' returning id`;
  if (!updated.length) return;
  await appendEvent(sql, { envelopeId: envelope.id, recipientId: recipient.id, type: "recipient.viewed", description: `Viewed by ${recipient.name} (${recipient.email})`, meta });
  const { notifyActivity } = await import("@/lib/services/notify");
  await notifyActivity(envelope.id, recipient, "viewed").catch(() => {});
  const { emitWebhook } = await import("@/lib/services/webhooks");
  await emitWebhook(envelope.workspaceId, "recipient.viewed", envelope.id, { recipient: { id: recipient.id, name: recipient.name, email: recipient.email } });
}

export async function recordConsent(token: string, meta: RequestMeta, accessCookie?: string | null) {
  const { recipient, envelope } = await requireActive(token, accessCookie);
  if (recipient.consentedAt) return;
  await sql`update sign.recipients set consented_at = now() where id = ${recipient.id}`;
  await appendEvent(sql, { envelopeId: envelope.id, recipientId: recipient.id, type: "recipient.consented", description: `${recipient.name} agreed to use electronic records and signatures`, meta });
}

function decodePng(dataUrl: string): Uint8Array {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || "");
  if (!m) throw new AppError("bad_image", "Signature image must be a PNG");
  const bytes = new Uint8Array(Buffer.from(m[1], "base64"));
  if (bytes.byteLength > 1_500_000) throw new AppError("image_too_large", "Signature image is too large");
  return bytes;
}

export async function adoptSignature(token: string, input: { style: "font" | "draw" | "upload"; font?: string | null; fullName: string; initials: string; signaturePng: string; initialsPng: string; stampPng?: string | null }, meta: RequestMeta, accessCookie?: string | null) {
  const { recipient, envelope } = await requireActive(token, accessCookie);
  const fullName = input.fullName.trim().slice(0, 120);
  const initials = input.initials.trim().slice(0, 8);
  if (!fullName || !initials) throw new AppError("name_required", "Enter your full name and initials");
  const sig = decodePng(input.signaturePng);
  const ini = decodePng(input.initialsPng);
  const stamp = Date.now();
  const sigFile = await storeFile(sql, { workspaceId: envelope.workspaceId, path: `envelopes/${envelope.id}/signatures/${recipient.id}-${stamp}-signature.png`, filename: "signature.png", contentType: "image/png", bytes: sig, kind: "signature" });
  const iniFile = await storeFile(sql, { workspaceId: envelope.workspaceId, path: `envelopes/${envelope.id}/signatures/${recipient.id}-${stamp}-initials.png`, filename: "initials.png", contentType: "image/png", bytes: ini, kind: "signature" });
  let stampFileId: string | null = recipient.signatureAdoption?.stampFileId ?? null;
  if (input.stampPng) {
    const st = decodePng(input.stampPng);
    const stFile = await storeFile(sql, { workspaceId: envelope.workspaceId, path: `envelopes/${envelope.id}/signatures/${recipient.id}-${stamp}-stamp.png`, filename: "stamp.png", contentType: "image/png", bytes: st, kind: "signature" });
    stampFileId = stFile.id;
  }
  const adoption: SignatureAdoption = { style: input.style, font: input.font ?? null, fullName, initials, signatureFileId: sigFile.id, initialsFileId: iniFile.id, stampFileId, signatureId: recipient.signatureAdoption?.signatureId ?? crypto.randomUUID().toUpperCase(), adoptedAt: new Date().toISOString(), ip: meta.ip };
  await sql`update sign.recipients set signature_adoption = ${sql.json(adoption as never)}, updated_at = now() where id = ${recipient.id}`;
  await appendEvent(sql, { envelopeId: envelope.id, recipientId: recipient.id, type: "recipient.signature_adopted", description: `${recipient.name} adopted a signature (${input.style === "draw" ? "drawn on device" : input.style === "upload" ? "uploaded" : "pre-selected style"})`, meta });
  return adoption;
}

export async function completeRecipient(token: string, values: Record<string, string>, meta: RequestMeta, accessCookie?: string | null) {
  const { recipient, envelope } = await requireActive(token, accessCookie);
  const [ws] = await sql<{ settings: Record<string, string> }[]>`select settings from sign.workspaces where id = ${envelope.workspaceId}`;
  const tz = ws?.settings?.timezone || DEFAULT_TZ;
  await sql.begin(async (tx) => {
    const [lockedEnv] = await tx<Envelope[]>`select * from sign.envelopes where id = ${envelope.id} for update`;
    if (lockedEnv.status !== "sent") throw new AppError("closed", "This envelope is no longer open for signing", 409);
    const [r] = await tx<Recipient[]>`select * from sign.recipients where id = ${recipient.id}`;
    if (r.status !== "sent" && r.status !== "delivered") throw new AppError("not_active", "You already finished this envelope", 409);
    if (!r.consentedAt) throw new AppError("consent_required", "Agree to use electronic records and signatures first");
    const fields = await tx<Field[]>`select * from sign.fields where recipient_id = ${r.id}`;
    const adoption = r.signatureAdoption;
    const needsSig = fields.some((f) => (f.type === "signature" || f.type === "initials") && values[f.id]);
    if (needsSig && !adoption) throw new AppError("signature_required", "Adopt your signature first");
    const fullName = adoption?.fullName || r.name;
    const [first, ...rest] = fullName.split(/\s+/);

    // radio groups: the selected option per group
    const radioChoice = new Map<string, string>();
    for (const f of fields.filter((f) => f.type === "radio")) {
      if (values[f.id] === "true" && f.options?.group) radioChoice.set(f.options.group, f.options.optionValue ?? f.id);
    }
    // completed values of earlier recipients, for conditional logic and formulas
    const others = await tx<{ label: string | null; value: string | null }[]>`select label, value from sign.fields where envelope_id = ${envelope.id} and recipient_id <> ${r.id} and value is not null`;
    const missing: string[] = [];
    const finals = new Map<string, string | null>();

    // pass 1: raw values
    for (const f of fields) {
      let value: string | null = f.value;
      const input = values[f.id];
      switch (f.type) {
        case "signature":
        case "initials": {
          const stamped = input === "signed" || input === "initialed" || input === "true";
          value = stamped ? (f.type === "signature" ? "signed" : "initialed") : null;
          break;
        }
        case "stamp": value = input === "stamped" && adoption?.stampFileId ? "stamped" : null; break;
        case "date_signed": value = fmtDate(new Date(), tz); break;
        case "name": value = fullName; break;
        case "first_name": value = first ?? ""; break;
        case "last_name": value = rest.join(" "); break;
        case "email": value = r.email; break;
        case "checkbox": value = f.readOnly ? f.value : input === "true" ? "true" : "false"; break;
        case "radio": {
          const group = f.options?.group;
          value = group ? radioChoice.get(group) ?? "" : input === "true" ? (f.options?.optionValue ?? "x") : "";
          break;
        }
        case "note": value = f.value; break;
        case "approve": value = input === "approved" ? "approved" : null; break;
        case "decline": value = null; break;
        case "formula": value = null; break; // pass 3
        case "drawing": {
          if (input && input.startsWith("data:image/png;base64,")) {
            const bytes = decodePng(input);
            const file = await storeFile(tx, { workspaceId: envelope.workspaceId, path: `envelopes/${envelope.id}/drawings/${r.id}-${f.id}.png`, filename: "drawing.png", contentType: "image/png", bytes, kind: "attachment" });
            value = file.id;
          } else value = null;
          break;
        }
        case "attachment": {
          if (input && /^[0-9a-f-]{36}$/i.test(input)) {
            const [file] = await tx<{ id: string; path: string }[]>`select id, path from sign.files where id = ${input} and workspace_id = ${envelope.workspaceId}`;
            if (!file || !file.path.startsWith(`envelopes/${envelope.id}/attachments/${r.id}/`)) throw new AppError("bad_attachment", "That attachment didn't upload correctly. Attach it again.");
            value = file.id;
          } else value = null;
          break;
        }
        default: {
          if (f.readOnly) break;
          value = (input ?? "").toString().slice(0, f.options?.maxLength ?? 500);
          if (f.type === "number" && value && Number.isNaN(Number(value.replace(/[,\s$]/g, "")))) throw new AppError("bad_number", `"${f.label || "Number"}" must be a number`);
          if (f.type === "dropdown" && value && f.options?.choices && !f.options.choices.includes(value)) throw new AppError("bad_choice", "Pick one of the options");
          const bad = f.type === "dropdown" ? null : validateText(value, f.options);
          if (bad) throw new AppError("bad_format", `${f.label || "A field"}: ${bad}`);
        }
      }
      finals.set(f.id, value);
    }

    // pass 2: conditional logic + required checks
    const byLabel = (label: string) => {
      const mine = fields.find((x) => x.label === label);
      if (mine) return finals.get(mine.id) ?? null;
      return others.find((o) => o.label === label)?.value ?? null;
    };
    for (const f of fields) {
      const active = isFieldActive(f.options, byLabel);
      if (!active) { finals.set(f.id, null); continue; }
      if (!f.required || f.readOnly) continue;
      const v = finals.get(f.id);
      const empty = v === null || v === undefined || v === "" || (f.type === "checkbox" && v !== "true");
      if (empty && !["formula", "note", "decline", "approve", "date_signed", "name", "first_name", "last_name", "email"].includes(f.type)) {
        missing.push(f.label || (f.type === "signature" ? "Signature" : f.type === "initials" ? "Initials" : f.type));
      }
    }

    // pass 3: formulas
    for (const f of fields.filter((x) => x.type === "formula")) {
      if (!isFieldActive(f.options, byLabel)) continue;
      const n = f.options?.formula ? evaluateFormula(f.options.formula, byLabel) : null;
      finals.set(f.id, n === null ? "" : formatFormula(n, f.options?.decimals ?? 2));
    }

    for (const f of fields) await tx`update sign.fields set value = ${finals.get(f.id) ?? null}, filled_at = now() where id = ${f.id}`;
    if (missing.length) throw new AppError("required_fields", `Complete the required fields: ${[...new Set(missing)].slice(0, 5).join(", ")}`);
    await tx`update sign.recipients set status = 'completed', completed_at = now(), ip = ${meta.ip}, user_agent = ${meta.userAgent}, geo = ${meta.geo ? sql.json(meta.geo) : null}, updated_at = now() where id = ${r.id}`;
    await tx`update sign.signing_tokens set purpose = 'completed' where recipient_id = ${r.id}`;
    const verb = r.role === "approver" ? "Approved" : r.role === "viewer" ? "Viewed and acknowledged" : "Signed";
    await appendEvent(tx, { envelopeId: envelope.id, recipientId: r.id, type: r.role === "approver" ? "recipient.approved" : r.role === "viewer" ? "recipient.acknowledged" : "recipient.signed", description: `${verb} by ${r.name} (${r.email})`, meta });
  });
  // The signature is committed. Nothing below may turn into a signer-facing error.
  try {
    const { notifyActivity } = await import("@/lib/services/notify");
    await notifyActivity(envelope.id, recipient, recipient.role === "approver" ? "approved" : "signed");
  } catch (e) { console.error("[imagine-sign] notifyActivity failed", envelope.id, e); }
  try {
    const { emitWebhook } = await import("@/lib/services/webhooks");
    await emitWebhook(envelope.workspaceId, "recipient.signed", envelope.id, { recipient: { id: recipient.id, name: recipient.name, email: recipient.email, role: recipient.role } });
  } catch (e) { console.error("[imagine-sign] webhook failed", envelope.id, e); }
  try {
    const { activateRouting } = await import("@/lib/services/routing");
    await activateRouting(envelope.id, meta);
  } catch (e) { console.error("[imagine-sign] activateRouting failed", envelope.id, e instanceof Error ? e.stack || e.message : e); }
}

export async function declineRecipient(token: string, reason: string, meta: RequestMeta, accessCookie?: string | null) {
  const { recipient, envelope } = await requireActive(token, accessCookie);
  const why = reason.trim().slice(0, 1000);
  if (!why) throw new AppError("reason_required", "Tell the sender why you're declining");
  await sql.begin(async (tx) => {
    await tx`select id from sign.envelopes where id = ${envelope.id} for update`;
    await tx`update sign.recipients set status = 'declined', declined_at = now(), decline_reason = ${why}, ip = ${meta.ip}, user_agent = ${meta.userAgent}, updated_at = now() where id = ${recipient.id}`;
    await tx`update sign.envelopes set status = 'declined', declined_at = now(), updated_at = now() where id = ${envelope.id} and status = 'sent'`;
    await appendEvent(tx, { envelopeId: envelope.id, recipientId: recipient.id, type: "recipient.declined", description: `Declined by ${recipient.name} (${recipient.email}): ${why}`, meta, data: { reason: why } });
  });
  const { notifyDeclined } = await import("@/lib/services/notify");
  await notifyDeclined(envelope.id, recipient, why);
  const { emitWebhook } = await import("@/lib/services/webhooks");
  await emitWebhook(envelope.workspaceId, "recipient.declined", envelope.id, { recipient: { id: recipient.id, name: recipient.name, email: recipient.email }, reason: why });
}

export async function reassignRecipient(token: string, input: { name: string; email: string; reason: string }, meta: RequestMeta, accessCookie?: string | null) {
  const { recipient, envelope } = await requireActive(token, accessCookie);
  if (!envelope.allowReassign) throw new AppError("not_allowed", "The sender doesn't allow reassigning this envelope");
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError("bad_recipient", "Enter the new signer's name and email");
  if (email === recipient.email) throw new AppError("same_recipient", "That's already the current signer");
  let newId = "";
  await sql.begin(async (tx) => {
    await tx`select id from sign.envelopes where id = ${envelope.id} for update`;
    const [nr] = await tx<{ id: string }[]>`insert into sign.recipients (envelope_id, role, name, email, routing_order, position, color_index, template_role, status, sent_at)
      values (${envelope.id}, ${recipient.role}, ${name}, ${email}, ${recipient.routingOrder}, ${recipient.position}, ${recipient.colorIndex}, ${recipient.templateRole}, 'sent', now()) returning id`;
    newId = nr.id;
    await tx`update sign.fields set recipient_id = ${nr.id} where recipient_id = ${recipient.id}`;
    await tx`update sign.recipients set status = 'replaced', replaced_by = ${nr.id}, updated_at = now() where id = ${recipient.id}`;
    await tx`update sign.signing_tokens set revoked_at = now() where recipient_id = ${recipient.id} and revoked_at is null`;
    await appendEvent(tx, { envelopeId: envelope.id, recipientId: recipient.id, type: "recipient.reassigned", description: `${recipient.name} reassigned the envelope to ${name} (${email})${input.reason.trim() ? `: ${input.reason.trim()}` : ""}`, meta, data: { to: { name, email }, reason: input.reason } });
  });
  const { sendSigningRequest, notifyActivity } = await import("@/lib/services/notify");
  await sendSigningRequest(envelope.id, newId);
  await notifyActivity(envelope.id, recipient, "reassigned", `Reassigned to ${name} (${email})`).catch(() => {});
  const { emitWebhook } = await import("@/lib/services/webhooks");
  await emitWebhook(envelope.workspaceId, "recipient.reassigned", envelope.id, { from: recipient.email, to: email });
}
