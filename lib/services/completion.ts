import "server-only";
import { loadSeal } from "@/lib/seal";
import { brand } from "@/lib/brand";
import { sql } from "@/lib/db";
import { appendEvent } from "@/lib/audit";
import { getObject, storeFile } from "@/lib/storage";
import { renderCompleted, sealPdf, sha256Hex, DEFAULT_DISCLOSURE, shortSignatureId } from "@/lib/pdf";
import { createHash } from "node:crypto";
import type { RenderField, CertificateData, CertificateRecipient } from "@/lib/pdf/types";
import { envelopeIdDisplay, DEFAULT_TZ } from "@/lib/format";
import { geoLabel } from "@/lib/request-meta";
import type { Envelope, EnvelopeDocument, Field, Recipient, EnvelopeEvent } from "@/lib/types";

/** Stable signature id: the one minted at adoption, or a deterministic one for older adoptions. */
function signatureIdOf(r: Recipient): string {
  if (r.signatureAdoption?.signatureId) return r.signatureAdoption.signatureId;
  const h = createHash("sha256").update(`sig:${r.id}:${r.signatureAdoption?.signatureFileId ?? ""}`).digest("hex").toUpperCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

async function fileBytes(fileId: string): Promise<Uint8Array> {
  const [f] = await sql<{ path: string }[]>`select path from sign.files where id = ${fileId}`;
  return getObject(f.path);
}

/** Marks the envelope completed (exactly once), renders + seals the final PDF and certificate, emails everyone. */
export async function completeEnvelope(envelopeId: string) {
  const claimed = await sql<{ id: string }[]>`update sign.envelopes set status = 'completed', completed_at = now(), updated_at = now() where id = ${envelopeId} and status = 'sent' returning id`;
  if (!claimed.length) return;
  const ccs = await sql<{ id: string; name: string; email: string }[]>`update sign.recipients set status = 'completed', sent_at = coalesce(sent_at, now()), completed_at = now(), updated_at = now()
    where envelope_id = ${envelopeId} and role = 'cc' and status in ('created','sent') returning id, name, email`;
  for (const c of ccs) await appendEvent(sql, { envelopeId, recipientId: c.id, type: "recipient.copy_sent", description: `Completed copy sent to ${c.name} (${c.email})` });
  await appendEvent(sql, { envelopeId, type: "envelope.completed", description: "All recipients finished. Envelope completed." });
  // Render + seal + email out of the signer's request path. Vercel's after() keeps the function alive; the cron is the backstop.
  const run = () => finalizeCompletedEnvelope(envelopeId).catch((e) => console.error("[imagine-sign] finalize failed", envelopeId, e instanceof Error ? e.stack || e.message : e));
  try {
    const { after } = await import("next/server");
    after(run);
  } catch {
    await run();
  }
}

/** Builds the completed PDF for a completed envelope that doesn't have one yet (also used by cron retries). */
export async function finalizeCompletedEnvelope(envelopeId: string) {
  const [env] = await sql<Envelope[]>`select * from sign.envelopes where id = ${envelopeId}`;
  if (!env || env.status !== "completed" || env.completedFileId) return;
  const [ws] = await sql<{ settings: Record<string, string> }[]>`select settings from sign.workspaces where id = ${env.workspaceId}`;
  const tz = ws?.settings?.timezone || DEFAULT_TZ;
  const disclosure = (ws?.settings?.disclosureText || "").trim() || DEFAULT_DISCLOSURE;
  const docs = await sql<EnvelopeDocument[]>`select * from sign.documents where envelope_id = ${envelopeId} order by position`;
  const recs = await sql<Recipient[]>`select * from sign.recipients where envelope_id = ${envelopeId} order by routing_order, position`;
  const fields = await sql<Field[]>`select * from sign.fields where envelope_id = ${envelopeId}`;
  const events = await sql<EnvelopeEvent[]>`select * from sign.events where envelope_id = ${envelopeId} order by id`;
  const [owner] = await sql<{ name: string; email: string; company: string | null }[]>`select name, email, company from sign.users where id = ${env.ownerId}`;

  const documents = await Promise.all(docs.map(async (d) => ({ name: `${d.name}.pdf`, bytes: await fileBytes(d.fileId), sha: "" })));
  for (const d of documents) d.sha = sha256Hex(d.bytes);

  const sigCache = new Map<string, Uint8Array>();
  async function adoptionImage(r: Recipient, kind: "signature" | "initials") {
    const id = kind === "signature" ? r.signatureAdoption?.signatureFileId : r.signatureAdoption?.initialsFileId;
    if (!id) return null;
    if (!sigCache.has(id)) sigCache.set(id, await fileBytes(id));
    return sigCache.get(id)!;
  }

  const recById = new Map(recs.map((r) => [r.id, r]));
  const renderFields: RenderField[] = [];
  const attachments: { name: string; bytes: Uint8Array; contentType: string; recipient: string }[] = [];
  for (const f of fields) {
    const docIndex = docs.findIndex((d) => d.id === f.documentId);
    const r = recById.get(f.recipientId);
    if (docIndex < 0 || !r) continue;
    if (f.type === "note" || f.type === "decline") continue;
    const o = f.options ?? {};
    const format = o.font || o.bold || o.italic || o.underline || o.fontColor ? { font: o.font, bold: o.bold, italic: o.italic, underline: o.underline, color: o.fontColor } : null;
    const base = { id: f.id, documentIndex: docIndex, page: f.page, x: f.x, y: f.y, width: f.width, height: f.height, type: f.type as RenderField["type"], fontSize: o.fontSize, format };
    if (f.type === "signature" || f.type === "initials") {
      if (!f.value) continue;
      renderFields.push({ ...base, value: null, imagePng: await adoptionImage(r, f.type), stamp: f.type === "signature" ? { label: brand.stampLabel, id: shortSignatureId(signatureIdOf(r)) } : { label: "", id: null } });
    } else if (f.type === "stamp") {
      if (!f.value || !r.signatureAdoption?.stampFileId) continue;
      renderFields.push({ ...base, value: null, imagePng: await fileBytes(r.signatureAdoption.stampFileId) });
    } else if (f.type === "drawing") {
      if (!f.value) continue;
      renderFields.push({ ...base, value: null, imagePng: await fileBytes(f.value) });
    } else if (f.type === "attachment") {
      if (!f.value) continue;
      const [file] = await sql<{ path: string; filename: string; contentType: string }[]>`select path, filename, content_type from sign.files where id = ${f.value}`;
      if (!file) continue;
      attachments.push({ name: file.filename, bytes: await getObject(file.path), contentType: file.contentType, recipient: r.name });
      renderFields.push({ ...base, value: `Attachment: ${file.filename}` });
    } else if (f.type === "approve") {
      if (!f.value) continue;
      renderFields.push({ ...base, value: `Approved by ${r.name}` });
    } else if (f.type === "radio") {
      renderFields.push({ ...base, value: f.value, optionValue: f.options?.optionValue ?? "" });
    } else {
      if (f.value === null || f.value === "") continue;
      renderFields.push({ ...base, value: f.value });
    }
  }

  const firstEvent = (type: string, recipientId?: string) => events.find((e) => e.type === type && (!recipientId || e.recipientId === recipientId));
  const certRecipients: CertificateRecipient[] = [];
  for (const r of recs) {
    const consent = firstEvent("recipient.consented", r.id);
    certRecipients.push({
      name: r.name,
      email: r.email,
      role: r.role,
      routingOrder: r.routingOrder,
      status: r.status,
      securityLevel: r.accessCodeHash ? "Email, Account Authentication (None), Access Code" : "Email, Account Authentication (None)",
      signatureImagePng: r.role === "signer" && r.status === "completed" ? await adoptionImage(r, "signature") : null,
      signatureAdoption: r.signatureAdoption ? (r.signatureAdoption.style === "draw" ? "Drawn on Device" : r.signatureAdoption.style === "upload" ? "Uploaded Signature" : "Pre-selected Style") : null,
      signatureId: r.signatureAdoption ? signatureIdOf(r) : null,
      ip: r.ip,
      userAgent: r.userAgent,
      location: geoLabel(r.geo),
      sentAt: r.sentAt ? new Date(r.sentAt).toISOString() : null,
      viewedAt: r.deliveredAt ? new Date(r.deliveredAt).toISOString() : null,
      signedAt: r.completedAt ? new Date(r.completedAt).toISOString() : null,
      declinedAt: r.declinedAt ? new Date(r.declinedAt).toISOString() : null,
      declineReason: r.declineReason,
      consent: consent ? { acceptedAt: new Date(consent.createdAt).toISOString(), id: consent.hash.slice(0, 32) } : null,
    });
  }

  const sentEvent = firstEvent("envelope.sent");
  const certificate: CertificateData = {
    envelopeId: envelopeIdDisplay(env.id),
    subject: env.subject,
    status: "completed",
    timezone: tz,
    documents: docs.map((d, i) => ({ name: `${d.name}.pdf`, pageCount: d.pageCount, sha256: documents[i].sha })),
    signatureCount: fields.filter((f) => f.type === "signature" && f.value).length,
    initialsCount: fields.filter((f) => f.type === "initials" && f.value).length,
    sender: { name: env.senderName || owner?.name || "", email: env.senderEmail || owner?.email || "", ip: sentEvent?.ip ?? null, company: owner?.company ?? brand.company },
    createdAt: new Date(env.createdAt).toISOString(),
    sentAt: env.sentAt ? new Date(env.sentAt).toISOString() : null,
    completedAt: env.completedAt ? new Date(env.completedAt).toISOString() : new Date().toISOString(),
    recipients: certRecipients,
    events: events.map((e) => ({ at: new Date(e.createdAt).toISOString(), type: e.type, description: e.description, actor: null, ip: e.ip })),
    disclosureText: disclosure,
  };

  certificate.attachments = attachments.map((a) => ({ name: a.name, recipient: a.recipient, contentType: a.contentType, sha256: sha256Hex(a.bytes) }));
  const out = await renderCompleted({ documents: documents.map((d) => ({ name: d.name, bytes: d.bytes })), fields: renderFields, envelopeId: envelopeIdDisplay(env.id), stampEnvelopeId: true, certificate, attachments: attachments.map((a) => ({ name: a.name, bytes: a.bytes, contentType: a.contentType })) });
  const seal = await loadSeal();
  const combined = seal ? await sealPdf(out.combined, seal) : out.combined;
  const certOnly = seal ? await sealPdf(out.certificate, seal) : out.certificate;
  const hash = sha256Hex(combined);
  const safeName = (env.subject || docs[0]?.name || "Completed").replace(/[^\w\- .()]+/g, "").slice(0, 120) || "Completed";
  const completedFile = await storeFile(sql, { workspaceId: env.workspaceId, path: `envelopes/${env.id}/completed.pdf`, filename: `${safeName}.pdf`, contentType: "application/pdf", bytes: combined, kind: "completed" });
  const certFile = await storeFile(sql, { workspaceId: env.workspaceId, path: `envelopes/${env.id}/certificate.pdf`, filename: `Certificate of Completion - ${safeName}.pdf`, contentType: "application/pdf", bytes: certOnly, kind: "certificate" });
  await sql`update sign.envelopes set completed_file_id = ${completedFile.id}, certificate_file_id = ${certFile.id}, completed_sha256 = ${hash}, updated_at = now() where id = ${env.id}`;

  const { notifyCompleted } = await import("@/lib/services/notify");
  await notifyCompleted(env.id, { filename: `${safeName}.pdf`, content: combined });
  const { emitWebhook } = await import("@/lib/services/webhooks");
  await emitWebhook(env.workspaceId, "envelope.completed", env.id, { subject: env.subject, sha256: hash });
}
