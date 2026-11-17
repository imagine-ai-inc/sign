import "server-only";
import * as E from "@/lib/services/envelopes";
import * as T from "@/lib/services/templates";
import { sql } from "@/lib/db";
import type { Envelope, EnvelopeDocument, FieldOptions, Recipient } from "@/lib/types";
import type { ApiActor } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { loadDocumentInput } from "@/lib/api/documents";
import { resolveRecipientRef } from "@/lib/api/util";
import type { CreateEnvelopeBody, FieldBody, PatchEnvelopeBody, RecipientBody } from "@/lib/api/schemas";

/**
 * Envelope composition for REST v1. Every write goes through lib/services (validation, audit trail,
 * routing, webhooks live there). This file only translates the public request shape.
 */

function settingsPatch(b: Partial<PatchEnvelopeBody>, opts: { skipText?: boolean } = {}): E.DraftPatch {
  const p: E.DraftPatch = {};
  if (!opts.skipText) {
    if (b.subject !== undefined) p.subject = b.subject;
    if (b.message !== undefined) p.message = b.message;
  }
  for (const k of ["signingOrder", "reminderEnabled", "reminderDelayDays", "reminderFrequencyDays", "expireAfterDays", "expireWarnDays", "allowReassign", "allowComments", "visibility", "metadata"] as const) {
    if (b[k] !== undefined) (p as Record<string, unknown>)[k] = b[k];
  }
  return p;
}

function toRecipientInput(r: RecipientBody, i: number): E.RecipientInput {
  return {
    id: r.id ?? null,
    name: r.name ?? "",
    email: r.email ?? "",
    role: r.role ?? "signer",
    routingOrder: r.routingOrder ?? i + 1,
    templateRole: r.roleName ?? null,
    privateMessage: r.privateMessage ?? null,
    accessCode: r.accessCode === null ? "" : r.accessCode ?? undefined,
  };
}

/** signingOrder defaults to true when the caller gave different routing orders, like the app does. */
function impliedSigningOrder(recipients: RecipientBody[] | undefined): boolean | undefined {
  if (!recipients?.length) return undefined;
  const orders = new Set(recipients.map((r) => r.routingOrder ?? 1));
  return orders.size > 1 ? true : undefined;
}

function fieldOptions(f: FieldBody): FieldOptions {
  const base: FieldOptions = Array.isArray(f.options) ? { choices: f.options } : { ...(f.options ?? {}) };
  if (f.group) base.group = f.group;
  if (f.optionValue) base.optionValue = f.optionValue;
  return base;
}

async function freshEnvelope(id: string): Promise<Envelope> {
  const [env] = await sql<Envelope[]>`select * from sign.envelopes where id = ${id}`;
  if (!env) throw new ApiError("not_found", "Envelope not found", 404);
  return env;
}

/** Converts public field specs (explicit normalized boxes or anchors) into service FieldInputs. */
export async function buildFields(env: Envelope, specs: FieldBody[], recipients: Recipient[], documents: EnvelopeDocument[]): Promise<E.FieldInput[]> {
  const refList = recipients.filter((r) => r.status !== "replaced").sort((a, b) => a.position - b.position);
  const out: E.FieldInput[] = [];
  const missingAnchors: string[] = [];
  for (let i = 0; i < specs.length; i++) {
    const f = specs[i];
    const recipientId = resolveRecipientRef(f.recipient, refList);
    if (!recipientId) throw new ApiError("invalid_field_recipient", `fields[${i}].recipient "${f.recipient}" doesn't match a recipient index, email or role`, 400);
    const common = { recipientId, type: f.type, required: f.required, readOnly: f.readOnly, label: f.label ?? null, options: fieldOptions(f), value: f.value ?? null };
    if ("anchor" in f && f.anchor) {
      const hits = await E.resolveAnchorFields(env, [{ anchor: f.anchor, recipientId, type: f.type, offsetX: f.offsetX, offsetY: f.offsetY, width: f.width, height: f.height, required: f.required, label: f.label ?? null, options: common.options }]);
      if (!hits.length) missingAnchors.push(f.anchor);
      for (const h of hits) out.push({ ...h, readOnly: f.readOnly, value: f.value ?? null });
      continue;
    }
    const ex = f as Extract<FieldBody, { page: number }>;
    const doc = documents[ex.document ?? 0];
    if (!doc) throw new ApiError("invalid_field_document", `fields[${i}].document ${ex.document} doesn't exist (envelope has ${documents.length})`, 400);
    if (ex.page >= doc.pageCount) throw new ApiError("invalid_field_page", `fields[${i}].page ${ex.page} is past the end of "${doc.name}" (${doc.pageCount} pages, 0-based)`, 400);
    const page = doc.pages[ex.page];
    const def = E.defaultFieldSize(f.type);
    out.push({ ...common, documentId: doc.id, page: ex.page, x: ex.x, y: ex.y, width: ex.width ?? def.w / page.width, height: ex.height ?? def.h / page.height });
  }
  if (missingAnchors.length) {
    throw new ApiError("anchor_not_found", `Anchor text not found in any document: ${[...new Set(missingAnchors)].map((a) => JSON.stringify(a)).join(", ")}`, 422);
  }
  return out;
}

function existingAsInput(b: E.EnvelopeBundle): E.FieldInput[] {
  return b.fields.map((f) => ({ id: f.id, documentId: f.documentId, recipientId: f.recipientId, type: f.type, page: f.page, x: f.x, y: f.y, width: f.width, height: f.height, required: f.required, readOnly: f.readOnly, label: f.label, options: f.options, value: f.value }));
}

/** POST /envelopes */
export async function createEnvelope(actor: ApiActor, body: CreateEnvelopeBody): Promise<string> {
  const user = actor.user;
  let envelopeId: string | null = null;
  try {
    if (body.templateId) {
      const roles = body.roles?.length
        ? body.roles.map((r) => ({ role: r.role, name: r.name, email: r.email, accessCode: r.accessCode ?? null, privateMessage: r.privateMessage ?? null }))
        : (body.recipients ?? []).map((r) => ({ role: r.roleName ?? "", name: r.name ?? "", email: r.email ?? "", accessCode: r.accessCode ?? null, privateMessage: r.privateMessage ?? null }));
      const env = await T.createEnvelopeFromTemplate(user, body.templateId, {
        roles,
        subject: body.subject,
        message: body.message,
        prefill: body.prefill,
        metadata: body.metadata,
        createdVia: actor.via,
        apiKeyId: actor.apiKeyId,
      });
      envelopeId = env.id;
      await E.updateEnvelopeSettings(env.id, settingsPatch({ ...body, metadata: undefined }, { skipText: true }));
      if (body.fields?.length) {
        const b = await E.getBundle(env.id);
        const extra = await buildFields(b.envelope, body.fields, b.recipients, b.documents);
        await E.writeFields(b.envelope, [...existingAsInput(b), ...extra]);
      }
    } else {
      const env = await E.createDraft(user, { subject: body.subject, message: body.message, createdVia: actor.via, apiKeyId: actor.apiKeyId });
      envelopeId = env.id;
      const signingOrder = body.signingOrder ?? impliedSigningOrder(body.recipients);
      await E.updateEnvelopeSettings(env.id, settingsPatch({ ...body, signingOrder }, { skipText: true }));
      const docs = await Promise.all((body.documents ?? []).map((d, i) => loadDocumentInput(user, d, i)));
      for (const d of docs) await E.addDocumentBytes(await freshEnvelope(env.id), { name: d.name, bytes: d.bytes, createdBy: user.id });
      if (body.recipients?.length) await E.writeRecipients(await freshEnvelope(env.id), body.recipients.map(toRecipientInput));
      if (body.fields?.length) {
        const b = await E.getBundle(env.id);
        await E.writeFields(b.envelope, await buildFields(b.envelope, body.fields, b.recipients, b.documents));
      }
    }
    if (body.status === "sent") await E.sendEnvelope(actor, envelopeId);
    return envelopeId;
  } catch (e) {
    // Creation is all-or-nothing for API callers: don't leave half-built drafts behind.
    if (envelopeId) {
      const env = await freshEnvelope(envelopeId).catch(() => null);
      if (env?.status === "draft") await E.deleteEnvelope(user, envelopeId).catch(() => {});
    }
    throw e;
  }
}

/** PATCH /envelopes/{id} (drafts only) */
export async function patchEnvelope(actor: ApiActor, id: string, body: PatchEnvelopeBody) {
  const user = actor.user;
  const patch = settingsPatch(body);
  if (body.signingOrder === undefined && body.recipients) {
    const implied = impliedSigningOrder(body.recipients);
    if (implied) patch.signingOrder = implied;
  }
  await E.updateDraft(user, id, patch); // asserts edit access + draft status, even for an empty patch
  if (body.recipients) await E.setRecipients(user, id, body.recipients.map(toRecipientInput));
  if (body.fields) {
    await E.assertEditPublic(user, id);
    const b = await E.getBundle(id);
    await E.writeFields(b.envelope, await buildFields(b.envelope, body.fields, b.recipients, b.documents));
  }
}
