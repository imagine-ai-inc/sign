import "server-only";
import { env } from "@/lib/env";
import type { EnvelopeBundle, EnvelopeListRow } from "@/lib/services/envelopes";
import type { TemplateRow } from "@/lib/services/templates";
import type { Comment, EnvelopeEvent, Field, Recipient, EnvelopeDocument } from "@/lib/types";

/** Public JSON shapes for REST v1. Never expose hashes of secrets (access codes, tokens). */

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);

export function appLink(id: string, status: string) {
  return status === "draft" ? `${env.appUrl()}/envelopes/${id}/prepare` : `${env.appUrl()}/agreements/${id}`;
}

export function apiBase() {
  return `${env.appUrl()}/api/v1`;
}

export function serializeRecipient(r: Recipient) {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role,
    routingOrder: r.routingOrder,
    templateRole: r.templateRole,
    status: r.status,
    hasAccessCode: !!r.accessCodeHash,
    privateMessage: r.privateMessage,
    sentAt: iso(r.sentAt),
    deliveredAt: iso(r.deliveredAt),
    completedAt: iso(r.completedAt),
    declinedAt: iso(r.declinedAt),
    declineReason: r.declineReason,
    reminderCount: r.reminderCount,
    lastRemindedAt: iso(r.lastRemindedAt),
    replacedBy: r.replacedBy,
  };
}

export function serializeDocument(d: EnvelopeDocument, envelopeId: string) {
  return {
    id: d.id,
    name: d.name,
    position: d.position,
    pageCount: d.pageCount,
    pages: d.pages,
    url: `${apiBase()}/envelopes/${envelopeId}/documents/${d.id}`,
  };
}

export function serializeField(f: Field, documents: EnvelopeDocument[]) {
  return {
    id: f.id,
    documentId: f.documentId,
    document: Math.max(0, documents.findIndex((d) => d.id === f.documentId)),
    recipientId: f.recipientId,
    type: f.type,
    page: f.page,
    x: f.x,
    y: f.y,
    width: f.width,
    height: f.height,
    required: f.required,
    readOnly: f.readOnly,
    label: f.label,
    options: f.options ?? {},
    value: f.type === "signature" || f.type === "initials" ? (f.value ? "signed" : null) : f.value,
    filledAt: iso(f.filledAt),
  };
}

export function serializeBundle(b: EnvelopeBundle, opts: { includeFields?: boolean } = {}) {
  const e = b.envelope;
  const base = apiBase();
  return {
    object: "envelope" as const,
    id: e.id,
    status: e.status,
    subject: e.subject,
    message: e.message,
    createdVia: e.createdVia,
    templateId: e.templateId,
    owner: b.owner,
    sender: e.senderEmail ? { name: e.senderName, email: e.senderEmail } : null,
    signingOrder: e.signingOrder,
    visibility: e.visibility,
    reminderEnabled: e.reminderEnabled,
    reminderDelayDays: e.reminderDelayDays,
    reminderFrequencyDays: e.reminderFrequencyDays,
    expireAfterDays: e.expireAfterDays,
    expireWarnDays: e.expireWarnDays,
    allowReassign: e.allowReassign,
    allowComments: e.allowComments,
    metadata: e.metadata ?? {},
    createdAt: iso(e.createdAt),
    updatedAt: iso(e.updatedAt),
    sentAt: iso(e.sentAt),
    expiresAt: iso(e.expiresAt),
    completedAt: iso(e.completedAt),
    voidedAt: iso(e.voidedAt),
    voidReason: e.voidReason,
    declinedAt: iso(e.declinedAt),
    deletedAt: iso(e.deletedAt),
    completedSha256: e.completedSha256,
    documents: b.documents.map((d) => serializeDocument(d, e.id)),
    recipients: b.recipients.map(serializeRecipient),
    ...(opts.includeFields === false ? {} : { fields: b.fields.map((f) => serializeField(f, b.documents)) }),
    links: {
      app: appLink(e.id, e.status),
      self: `${base}/envelopes/${e.id}`,
      combined: e.status === "completed" ? `${base}/envelopes/${e.id}/documents/combined` : null,
      certificate: e.status === "completed" ? `${base}/envelopes/${e.id}/certificate` : null,
    },
  };
}

export function serializeListRow(r: EnvelopeListRow) {
  return {
    object: "envelope" as const,
    id: r.id,
    status: r.status,
    subject: r.subject,
    owner: { id: r.ownerId, name: r.ownerName, email: r.ownerEmail },
    recipients: r.recipients,
    actionRequired: r.myAction,
    sentAt: iso(r.sentAt),
    completedAt: iso(r.completedAt),
    expiresAt: iso(r.expiresAt),
    lastActivityAt: iso(r.lastActivityAt),
    createdAt: iso(r.createdAt),
    deletedAt: iso(r.deletedAt),
    links: { app: appLink(r.id, r.status), self: `${apiBase()}/envelopes/${r.id}` },
  };
}

export function serializeTemplateRow(t: TemplateRow) {
  return {
    object: "template" as const,
    id: t.id,
    name: t.name,
    description: t.description,
    shared: t.shared,
    owner: { id: t.ownerId, name: t.ownerName },
    roles: t.roleNames,
    documentCount: t.documentCount,
    useCount: t.useCount,
    lastUsedAt: iso(t.lastUsedAt),
    createdAt: iso(t.createdAt),
    updatedAt: iso(t.updatedAt),
  };
}

export function serializeTemplateDetail(t: TemplateRow, b: EnvelopeBundle) {
  const roleOf = new Map(b.recipients.map((r) => [r.id, r.templateRole || r.name || r.role]));
  return {
    ...serializeTemplateRow({ ...t, documentCount: b.documents.length, roleNames: b.recipients.map((r) => r.templateRole || r.name || r.role) }),
    subject: b.envelope.subject,
    message: b.envelope.message,
    signingOrder: b.envelope.signingOrder,
    roles: b.recipients.map((r) => ({
      name: r.templateRole || r.name || r.role,
      role: r.role,
      routingOrder: r.routingOrder,
      defaultName: r.name || null,
      defaultEmail: r.email || null,
      hasAccessCode: !!r.accessCodeHash,
      fieldCount: b.fields.filter((f) => f.recipientId === r.id).length,
    })),
    documents: b.documents.map((d) => ({ id: d.id, name: d.name, position: d.position, pageCount: d.pageCount, pages: d.pages })),
    fields: b.fields.map((f) => ({
      id: f.id,
      type: f.type,
      role: roleOf.get(f.recipientId) ?? null,
      document: Math.max(0, b.documents.findIndex((d) => d.id === f.documentId)),
      page: f.page,
      x: f.x,
      y: f.y,
      width: f.width,
      height: f.height,
      label: f.label,
      required: f.required,
      readOnly: f.readOnly,
      value: f.value,
      options: f.options ?? {},
      prefillable: !!f.label && !["signature", "initials", "date_signed"].includes(f.type),
    })),
  };
}

export function serializeEvent(e: EnvelopeEvent) {
  return {
    id: e.id,
    type: e.type,
    description: e.description,
    recipientId: e.recipientId,
    actorUserId: e.actorUserId,
    actorApiKeyId: e.actorApiKeyId,
    ip: e.ip,
    geo: e.geo,
    data: e.data ?? {},
    createdAt: iso(e.createdAt),
    hash: e.hash,
    prevHash: e.prevHash,
  };
}

export function serializeComment(c: Comment & { authorName?: string; authorEmail?: string }) {
  return {
    id: c.id,
    body: c.body,
    visibility: c.visibility,
    author: { userId: c.authorUserId, recipientId: c.authorRecipientId, name: c.authorName ?? null, email: c.authorEmail ?? null },
    createdAt: iso(c.createdAt),
  };
}
