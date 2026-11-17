/**
 * MCP tool definitions for Imagine Sign. Each tool = JSON Schema input + a handler over ImagineSignClient.
 * Shapes follow ARCHITECTURE.md REST v1. Keep descriptions agent-facing: when to use, what comes back.
 */
import { ImagineSignClient, ImagineSignError } from "./client";

type Schema = Record<string, unknown>;
export interface ToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: Schema;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean };
  handler: (args: Record<string, unknown>, c: ImagineSignClient) => Promise<unknown>;
}

const str = (description: string, extra: Schema = {}) => ({ type: "string", description, ...extra });
const num = (description: string, extra: Schema = {}) => ({ type: "number", description, ...extra });
const obj = (properties: Record<string, Schema>, required: string[] = [], extra: Schema = {}) => ({ type: "object", properties, required, additionalProperties: false, ...extra });

const FIELD_TYPES = ["signature", "initials", "date_signed", "name", "first_name", "last_name", "email", "company", "title", "text", "number", "date", "checkbox", "radio", "dropdown", "note"];

const recipientSchema = obj({
  name: str("Full name"),
  email: str("Email address", { format: "email" }),
  role: { type: "string", enum: ["signer", "cc", "viewer", "approver"], description: "Default signer. cc gets the completed copy only." },
  routingOrder: num("1 = first. Same number = parallel. Omit for 1.", { minimum: 1 }),
  roleName: str("Template role name to fill (e.g. \"Customer\"). Only when creating from a template; with a template, only the template's roles can be filled."),
  privateMessage: str("Note only this recipient sees."),
  accessCode: str("Optional code the recipient must enter before opening."),
}, ["name", "email"]);

const fieldSchema = obj({
  recipient: { description: "Recipient index (0-based), email, or template role name.", type: ["integer", "string"] },
  type: { type: "string", enum: FIELD_TYPES },
  document: { type: "integer", description: "Document index (0-based). Explicit placement only.", minimum: 0 },
  page: { type: "integer", description: "0-based page. Explicit placement only.", minimum: 0 },
  x: num("Left, normalized 0..1 of the displayed page width (top-left origin)."),
  y: num("Top, normalized 0..1 of the displayed page height."),
  width: num("Explicit placement: normalized width 0..1. Anchor placement: width in PDF points (default fits the field type)."),
  height: num("Explicit placement: normalized height 0..1. Anchor placement: height in PDF points."),
  anchor: str("Anchor text in the PDF, e.g. \"/sig1/\". Field is placed at every occurrence. Use instead of document/page/x/y."),
  offsetX: num("Points right of the anchor's top-left."),
  offsetY: num("Points below the anchor's top-left."),
  required: { type: "boolean" },
  label: str("Field label / tooltip."),
  value: str("Prefilled value (text-like fields)."),
  readOnly: { type: "boolean", description: "Prefilled and locked (text-like fields)." },
  options: { type: "array", items: { type: "string" }, description: "Dropdown choices." },
  group: str("Radio group name."),
  optionValue: str("This radio button's value."),
}, ["recipient", "type"]);

const documentSchema = obj({
  name: str("File name shown to signers, e.g. \"Order Form.pdf\"."),
  url: str("Public https URL to a PDF (preferred over base64). Private/internal hosts are rejected."),
  base64: str("PDF bytes, base64. Keep under ~10 MB."),
  fileId: str("Id of a file already uploaded to Imagine Sign."),
}, ["name"]);

function ok(res: unknown) { return res; }

export const tools: ToolDef[] = [
  {
    name: "whoami",
    title: "Who am I",
    description: "Return the Imagine Sign user and workspace the API key belongs to. Call first to confirm the key works.",
    inputSchema: obj({}),
    annotations: { readOnlyHint: true },
    handler: async (_a, c) => ok(await c.me()),
  },
  {
    name: "list_templates",
    title: "List templates",
    description: "List envelope templates (e.g. \"SaaS Services Order Form v4\") with their roles. Use to find a templateId before create_envelope.",
    inputSchema: obj({}),
    annotations: { readOnlyHint: true },
    handler: async (_a, c) => ok(await c.listTemplates()),
  },
  {
    name: "get_template",
    title: "Get template",
    description: "Get one template: documents, roles (name, routing order, default recipient) and fields (with labels you can prefill).",
    inputSchema: obj({ templateId: str("Template id") }, ["templateId"]),
    annotations: { readOnlyHint: true },
    handler: async (a, c) => ok(await c.getTemplate(String(a.templateId))),
  },
  {
    name: "create_envelope",
    title: "Create envelope",
    description:
      "Create an envelope, either from a template (templateId + recipients with roleName + optional prefill by field label) or from PDFs (documents + recipients + fields placed by anchor text or explicit normalized coords). " +
      "Default status is \"draft\" so a human can check it in the app; pass status \"sent\" only when the user explicitly asked to send now. Returns the envelope with recipient ids and links.app (the URL to show the human). Atomic: on any error nothing is created.",
    inputSchema: obj({
      subject: str("Email subject, e.g. \"Acme Inc x Example Co - SaaS Services Order Form\""),
      message: str("Email message body (plain text)."),
      templateId: str("Create from this template."),
      documents: { type: "array", items: documentSchema, description: "PDFs, in order. Not needed with templateId." },
      recipients: { type: "array", items: recipientSchema, minItems: 1 },
      fields: { type: "array", items: fieldSchema, description: "Signing fields. With a template, its fields are used automatically." },
      prefill: { type: "object", additionalProperties: { type: "string" }, description: "Template field label -> value, e.g. {\"Company\":\"Example Co\",\"Seats\":\"3\"}." },
      signingOrder: { type: "boolean", description: "Enforce routing order (sequential). Default true when routing orders differ." },
      expireAfterDays: { type: "integer", minimum: 1, maximum: 365 },
      reminderFrequencyDays: { type: "integer", minimum: 1, maximum: 30 },
      metadata: { type: "object", description: "Free-form tags, e.g. {\"hubspotDealId\":\"123\"}." },
      status: { type: "string", enum: ["draft", "sent"], description: "Default draft." },
    }, ["recipients"]),
    annotations: { destructiveHint: false, openWorldHint: true },
    handler: async (a, c) => {
      if (!a.templateId && !(Array.isArray(a.documents) && a.documents.length)) {
        throw new ImagineSignError(400, "invalid_request", "Provide templateId or at least one document.");
      }
      return ok(await c.createEnvelope({ ...a, status: a.status ?? "draft" }));
    },
  },
  {
    name: "send_envelope",
    title: "Send envelope",
    description: "Send a draft envelope: emails the first routing group. Only call after the user approved sending (this emails real people).",
    inputSchema: obj({ envelopeId: str("Envelope id") }, ["envelopeId"]),
    annotations: { destructiveHint: false, openWorldHint: true },
    handler: async (a, c) => ok(await c.sendEnvelope(String(a.envelopeId))),
  },
  {
    name: "get_envelope",
    title: "Get envelope",
    description: "Get status, recipients (status, viewed/signed times), documents and links for one envelope.",
    inputSchema: obj({ envelopeId: str("Envelope id"), includeEvents: { type: "boolean", description: "Also return the audit trail." } }, ["envelopeId"]),
    annotations: { readOnlyHint: true },
    handler: async (a, c) => {
      const env = await c.getEnvelope(String(a.envelopeId));
      if (!a.includeEvents) return env;
      return { envelope: env, events: await c.events(String(a.envelopeId)) };
    },
  },
  {
    name: "list_envelopes",
    title: "List envelopes",
    description: "Search envelopes, newest activity first. status: draft | sent (in progress) | completed | declined | voided | expired | action_required | waiting | expiring | deleted. q matches subject, recipient names/emails and envelope id. Page with nextCursor.",
    inputSchema: obj({ status: { type: "string", enum: ["all", "draft", "sent", "completed", "declined", "voided", "expired", "deleted", "action_required", "waiting", "expiring", "inbox"], description: "Filter by status or folder" }, q: str("Search text"), limit: { type: "integer", minimum: 1, maximum: 100 }, cursor: str("Pagination cursor from the previous call") }),
    annotations: { readOnlyHint: true },
    handler: async (a, c) => ok(await c.listEnvelopes({ status: a.status as string | undefined, q: a.q as string | undefined, limit: (a.limit as number | undefined) ?? 20, cursor: a.cursor as string | undefined })),
  },
  {
    name: "void_envelope",
    title: "Void envelope",
    description: "Void a sent, unfinished envelope. Recipients are emailed and links stop working. Irreversible: confirm with the user first.",
    inputSchema: obj({ envelopeId: str("Envelope id"), reason: str("Shown to recipients") }, ["envelopeId", "reason"]),
    annotations: { destructiveHint: true, openWorldHint: true },
    handler: async (a, c) => ok(await c.voidEnvelope(String(a.envelopeId), String(a.reason))),
  },
  {
    name: "resend_envelope",
    title: "Resend envelope",
    description: "Re-send the signing email to the recipients currently waiting (a manual reminder). Optionally only one recipient. Emails real people: confirm first.",
    inputSchema: obj({ envelopeId: str("Envelope id"), recipientId: str("Only this recipient (id from get_envelope)") }, ["envelopeId"]),
    annotations: { openWorldHint: true },
    handler: async (a, c) => ok(await c.resendEnvelope(String(a.envelopeId), a.recipientId ? String(a.recipientId) : undefined)),
  },
  {
    name: "get_signing_link",
    title: "Get signing link",
    description: "Create a fresh signing URL for one recipient whose turn it is (status sent or delivered), e.g. to sign in person. Treat it as a secret: anyone with it can sign. Never post it in shared channels.",
    inputSchema: obj({ envelopeId: str("Envelope id"), recipientId: str("Recipient id from get_envelope") }, ["envelopeId", "recipientId"]),
    annotations: { openWorldHint: false },
    handler: async (a, c) => ok(await c.signingLink(String(a.envelopeId), String(a.recipientId))),
  },
  {
    name: "download_completed",
    title: "Download completed PDF",
    description: "Return URLs for the completed, sealed PDF and the Certificate of Completion. Fetch them with the same Bearer key. Only works once the envelope is completed.",
    inputSchema: obj({ envelopeId: str("Envelope id") }, ["envelopeId"]),
    annotations: { readOnlyHint: true },
    handler: async (a, c) => {
      const id = String(a.envelopeId);
      const env = (await c.getEnvelope(id)) as { status?: string; envelope?: { status?: string } } | null;
      const status = env?.status ?? env?.envelope?.status;
      if (status && status !== "completed") throw new ImagineSignError(409, "not_completed", `Envelope is ${status}, not completed yet.`);
      return { envelopeId: id, status: status ?? "completed", combinedPdfUrl: c.completedUrl(id), certificateUrl: c.certificateUrl(id), auth: "Authorization: Bearer <same isk_ key>" };
    },
  },
  {
    name: "add_comment",
    title: "Add comment",
    description: "Add a comment to an envelope's collaboration thread. visibility \"internal\" (team only, default) or \"everyone\" (recipients see it too).",
    inputSchema: obj({ envelopeId: str("Envelope id"), body: str("Comment text"), visibility: { type: "string", enum: ["internal", "everyone"] } }, ["envelopeId", "body"]),
    annotations: { openWorldHint: true },
    handler: async (a, c) => ok(await c.addComment(String(a.envelopeId), { body: a.body, visibility: a.visibility ?? "internal" })),
  },
  {
    name: "list_comments",
    title: "List comments",
    description: "Read the collaboration thread on an envelope.",
    inputSchema: obj({ envelopeId: str("Envelope id") }, ["envelopeId"]),
    annotations: { readOnlyHint: true },
    handler: async (a, c) => ok(await c.comments(String(a.envelopeId))),
  },
];

export const toolMap = new Map(tools.map((t) => [t.name, t]));

/** Minimal JSON-Schema check for required keys + enums + basic types (full validation happens in REST v1 via zod). */
export function validateArgs(t: ToolDef, args: unknown): string | null {
  if (args === undefined || args === null) args = {};
  if (typeof args !== "object" || Array.isArray(args)) return "arguments must be an object";
  const s = t.inputSchema as { properties?: Record<string, { type?: string | string[]; enum?: string[] }>; required?: string[] };
  const a = args as Record<string, unknown>;
  for (const r of s.required ?? []) if (a[r] === undefined || a[r] === null || a[r] === "") return `missing required argument: ${r}`;
  for (const [k, v] of Object.entries(a)) {
    const p = s.properties?.[k];
    if (!p) return `unknown argument: ${k}`;
    if (p.enum && !p.enum.includes(v as string)) return `${k} must be one of ${p.enum.join(", ")}`;
    const types = Array.isArray(p.type) ? p.type : p.type ? [p.type] : [];
    if (types.length) {
      const actual = Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : typeof v;
      const okType = types.some((ty) => ty === actual || (ty === "number" && (actual === "integer" || actual === "number")) || (ty === "integer" && actual === "integer"));
      if (!okType) return `${k} must be ${types.join(" or ")}`;
    }
  }
  return null;
}
