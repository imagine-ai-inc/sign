import { z } from "zod";

/** Request body schemas for REST v1. Kept free of server-only imports so tests and the OpenAPI doc can use them. */

export const FIELD_TYPES = ["signature", "initials", "date_signed", "name", "first_name", "last_name", "email", "company", "title", "text", "number", "date", "checkbox", "radio", "dropdown", "note"] as const;
export const RECIPIENT_ROLES = ["signer", "cc", "viewer", "approver"] as const;

const recipientRef = z.union([z.number().int().min(0), z.string().min(1).max(320)]);

export const recipientInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().max(200).optional().default(""),
  email: z.string().trim().max(320).optional().default(""),
  role: z.enum(RECIPIENT_ROLES).optional().default("signer"),
  routingOrder: z.number().int().min(1).max(100).optional(),
  /** Template role this person fills (only with templateId). Alias: role name in `roles`. */
  roleName: z.string().trim().max(100).optional(),
  privateMessage: z.string().max(2000).optional().nullable(),
  accessCode: z.string().trim().min(1).max(50).optional().nullable(),
});

export const fieldOptionsInput = z.object({
  choices: z.array(z.string().max(200)).max(100).optional(),
  group: z.string().max(100).optional(),
  optionValue: z.string().max(200).optional(),
  fontSize: z.number().min(4).max(36).optional(),
  placeholder: z.string().max(200).optional(),
  tooltip: z.string().max(500).optional(),
  validation: z.enum(["none", "email", "number", "date"]).optional(),
  maxLength: z.number().int().min(1).max(4000).optional(),
});

const fieldBase = {
  recipient: recipientRef,
  type: z.enum(FIELD_TYPES),
  required: z.boolean().optional(),
  readOnly: z.boolean().optional(),
  label: z.string().max(100).optional().nullable(),
  value: z.string().max(4000).optional().nullable(),
  /** dropdown choices as an array, or the full options object */
  options: z.union([z.array(z.string().max(200)).max(100), fieldOptionsInput]).optional(),
  group: z.string().max(100).optional(),
  optionValue: z.string().max(200).optional(),
};

export const explicitField = z.object({
  ...fieldBase,
  document: z.number().int().min(0).optional().default(0),
  page: z.number().int().min(0),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().gt(0).max(1).optional(),
  height: z.number().gt(0).max(1).optional(),
});

export const anchorField = z.object({
  ...fieldBase,
  anchor: z.string().min(1).max(100),
  offsetX: z.number().min(-2000).max(2000).optional(),
  offsetY: z.number().min(-2000).max(2000).optional(),
  /** in PDF points for anchor fields */
  width: z.number().gt(0).max(2000).optional(),
  height: z.number().gt(0).max(2000).optional(),
});

export const fieldInput = z.union([anchorField, explicitField]);

export const documentInput = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    base64: z.string().min(8).optional(),
    url: z.string().url().max(2000).optional(),
    fileId: z.string().uuid().optional(),
  })
  .refine((d) => [d.base64, d.url, d.fileId].filter(Boolean).length === 1, { message: "each document needs exactly one of base64, url or fileId" });

export const settingsInput = {
  subject: z.string().max(300).optional(),
  message: z.string().max(10000).optional(),
  signingOrder: z.boolean().optional(),
  reminderEnabled: z.boolean().optional(),
  reminderDelayDays: z.number().int().min(1).max(60).optional(),
  reminderFrequencyDays: z.number().int().min(1).max(60).optional(),
  expireAfterDays: z.number().int().min(1).max(999).optional(),
  expireWarnDays: z.number().int().min(0).max(60).optional(),
  allowReassign: z.boolean().optional(),
  allowComments: z.boolean().optional(),
  visibility: z.enum(["workspace", "private"]).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
};

export const createEnvelopeBody = z
  .object({
    ...settingsInput,
    templateId: z.string().uuid().optional(),
    documents: z.array(documentInput).max(20).optional(),
    recipients: z.array(recipientInput).max(50).optional(),
    /** Alias for template use: [{ role: "Customer", name, email }] */
    roles: z.array(z.object({ role: z.string().min(1).max(100), name: z.string().max(200), email: z.string().max(320), accessCode: z.string().max(50).optional().nullable(), privateMessage: z.string().max(2000).optional().nullable() })).max(50).optional(),
    fields: z.array(fieldInput).max(500).optional(),
    prefill: z.record(z.string(), z.string().max(4000)).optional(),
    status: z.enum(["draft", "sent"]).optional().default("draft"),
  })
  .refine((b) => !!b.templateId || (b.documents?.length ?? 0) > 0, { message: "provide templateId or at least one document", path: ["documents"] });

export const patchEnvelopeBody = z.object({
  ...settingsInput,
  recipients: z.array(recipientInput).max(50).optional(),
  fields: z.array(fieldInput).max(500).optional(),
});

export const voidBody = z.object({ reason: z.string().trim().min(1, "add a reason for voiding").max(500) });
export const resendBody = z.object({ recipientId: z.string().uuid().optional() });
export const commentBody = z.object({ body: z.string().trim().min(1).max(4000), visibility: z.enum(["internal", "everyone"]).optional().default("internal") });
export const webhookBody = z.object({ url: z.string().url().max(2000), events: z.array(z.string().max(60)).max(30).optional().default(["*"]), description: z.string().max(300).optional() });

export type CreateEnvelopeBody = z.infer<typeof createEnvelopeBody>;
export type PatchEnvelopeBody = z.infer<typeof patchEnvelopeBody>;
export type RecipientBody = z.infer<typeof recipientInput>;
export type FieldBody = z.infer<typeof fieldInput>;
export type DocumentBody = z.infer<typeof documentInput>;
