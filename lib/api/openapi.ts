import { brand } from "../brand";
/**
 * OpenAPI 3.1 document for REST v1. Hand-written to match lib/api/router.ts + lib/api/schemas.ts.
 * tests/api/openapi.test.ts checks every router path is documented and vice versa.
 */

const FIELD_TYPES = ["signature", "initials", "date_signed", "name", "first_name", "last_name", "email", "company", "title", "text", "number", "date", "checkbox", "radio", "dropdown", "note"];
const WEBHOOK_EVENTS = ["*", "envelope.sent", "envelope.delivered", "recipient.viewed", "recipient.signed", "recipient.declined", "recipient.reassigned", "envelope.completed", "envelope.voided", "envelope.expired", "envelope.corrected", "comment.added"];
const STATUS_FILTERS = ["all", "draft", "sent", "completed", "declined", "voided", "expired", "deleted", "action_required", "waiting", "expiring", "inbox"];

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const jsonBody = (schema: unknown, example?: unknown) => ({ required: true, content: { "application/json": { schema, ...(example ? { example } : {}) } } });
const ok = (description: string, schema: unknown) => ({ description, content: { "application/json": { schema } } });
const pdf = (description: string) => ({ description, content: { "application/pdf": { schema: { type: "string", format: "binary" } } } });
const errs = (...codes: number[]) => Object.fromEntries(codes.map((c) => [String(c), { $ref: `#/components/responses/E${c}` }]));
const idParam = (name: string, description: string) => ({ name, in: "path", required: true, description, schema: { type: "string", format: "uuid" } });

const ENV_ID = idParam("id", "Envelope id");

export function buildOpenApi(serverUrl = "http://localhost:3000/api/v1") {
  return {
    openapi: "3.1.0",
    info: {
      title: `${brand.name} API`,
      version: "1.0.0",
      summary: "Create, send and track e-signature envelopes.",
      description:
        `REST API for ${brand.name}, a self-hosted Imagine Sign e-signature instance. Authenticate with a personal API key ` +
        "(Settings > API keys) sent as `Authorization: Bearer isk_...`. Every call acts as the user who owns the key, " +
        "with exactly that user's access. Field coordinates are normalized to the displayed page, origin top-left, 0..1.",
      contact: { name: brand.name, ...(brand.supportEmail ? { email: brand.supportEmail } : {}), url: serverUrl.replace(/\/api\/v1$/, "/developers") },
    },
    servers: [{ url: serverUrl }],
    security: [{ bearerAuth: [] }],
    tags: [
      { name: "Account" }, { name: "Templates" }, { name: "Envelopes" }, { name: "Recipients" },
      { name: "Documents" }, { name: "Audit & comments" }, { name: "Webhooks" },
    ],
    paths: {
      "/me": {
        get: { tags: ["Account"], operationId: "getMe", summary: "Who the API key belongs to", responses: { "200": ok("Current user, workspace and key", ref("Me")), ...errs(401) } },
      },
      "/templates": {
        get: {
          tags: ["Templates"], operationId: "listTemplates", summary: "List templates you can use",
          parameters: [
            { name: "q", in: "query", schema: { type: "string" }, description: "Search name and description" },
            { name: "scope", in: "query", schema: { type: "string", enum: ["all", "mine", "shared"] } },
          ],
          responses: { "200": ok("Templates", listOf("TemplateSummary")), ...errs(401, 403) },
        },
      },
      "/templates/{id}": {
        get: { tags: ["Templates"], operationId: "getTemplate", summary: "Get a template with roles, documents and fields", parameters: [idParam("id", "Template id")], responses: { "200": ok("Template", ref("Template")), ...errs(401, 403, 404) } },
      },
      "/envelopes": {
        get: {
          tags: ["Envelopes"], operationId: "listEnvelopes", summary: "List and search envelopes",
          parameters: [
            { name: "status", in: "query", schema: { type: "string", enum: STATUS_FILTERS }, description: "Status or app folder. `sent` = in progress. A folder id (uuid) also works." },
            { name: "q", in: "query", schema: { type: "string" }, description: "Matches subject, recipient name or email, envelope id" },
            { name: "scope", in: "query", schema: { type: "string", enum: ["team", "mine"] }, description: "`mine` = only envelopes you own" },
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
            { name: "cursor", in: "query", schema: { type: "string" }, description: "`nextCursor` from the previous page" },
          ],
          responses: { "200": ok("Envelopes, newest activity first", { allOf: [listOf("EnvelopeSummary"), { type: "object", properties: { hasMore: { type: "boolean" }, nextCursor: { type: ["string", "null"] } } }] }), ...errs(400, 401, 403) },
        },
        post: {
          tags: ["Envelopes"], operationId: "createEnvelope", summary: "Create an envelope (draft by default) from a template or from PDFs",
          description:
            "From a template: pass `templateId` and fill each role via `roles` (or `recipients[].roleName`); prefill labeled fields with `prefill`.\n\n" +
            "From documents: pass `documents` (base64, https `url`, or `fileId`), `recipients`, and `fields` placed either explicitly " +
            "(normalized `document`/`page`/`x`/`y`) or by `anchor` text found in the PDF (offsets and sizes in points).\n\n" +
            "`status: \"sent\"` sends immediately (emails the first routing group). Creation is atomic: on any error nothing is left behind.",
          requestBody: jsonBody(ref("CreateEnvelope"), {
            templateId: "6a1f3e0c-0000-4000-8000-000000000001",
            subject: "Acme Inc x Example Co - Order Form",
            roles: [{ role: "Customer", name: "Jordan Lee", email: "jordan@example.com" }],
            prefill: { Company: "Example Co", Seats: "3" },
            status: "draft",
          }),
          responses: { "201": ok("The new envelope", ref("Envelope")), ...errs(400, 401, 403, 404, 409, 413, 422) },
        },
      },
      "/envelopes/{id}": {
        get: { tags: ["Envelopes"], operationId: "getEnvelope", summary: "Get an envelope with documents, recipients and fields", parameters: [ENV_ID], responses: { "200": ok("Envelope", ref("Envelope")), ...errs(401, 403, 404) } },
        patch: {
          tags: ["Envelopes"], operationId: "updateEnvelope", summary: "Update a draft (settings, recipients, fields)",
          description: "`recipients` and `fields`, when present, replace the whole list. Include recipient `id`s to keep existing recipients. Drafts only (409 otherwise).",
          parameters: [ENV_ID], requestBody: jsonBody(ref("UpdateEnvelope")),
          responses: { "200": ok("Updated envelope", ref("Envelope")), ...errs(400, 401, 403, 404, 409, 422) },
        },
        delete: {
          tags: ["Envelopes"], operationId: "deleteEnvelope", summary: "Delete an envelope",
          description: "Drafts are purged. Completed, declined, voided or expired envelopes move to Deleted. In-progress envelopes must be voided first (409).",
          parameters: [ENV_ID],
          responses: { "200": ok("Deleted", { type: "object", properties: { object: { const: "envelope" }, id: { type: "string" }, deleted: { const: true }, mode: { type: "string", enum: ["purged", "deleted"] } } }), ...errs(401, 403, 404, 409) },
        },
      },
      "/envelopes/{id}/send": {
        post: { tags: ["Envelopes"], operationId: "sendEnvelope", summary: "Send a draft", description: "Validates (documents, a signature field for every signer, subject) and emails the first routing group.", parameters: [ENV_ID], responses: { "200": ok("Sent envelope", ref("Envelope")), ...errs(400, 401, 403, 404, 409) } },
      },
      "/envelopes/{id}/void": {
        post: { tags: ["Envelopes"], operationId: "voidEnvelope", summary: "Void an in-progress envelope", parameters: [ENV_ID], requestBody: jsonBody({ type: "object", required: ["reason"], properties: { reason: { type: "string", maxLength: 500 } } }), responses: { "200": ok("Voided envelope", ref("Envelope")), ...errs(400, 401, 403, 404, 409) } },
      },
      "/envelopes/{id}/resend": {
        post: { tags: ["Envelopes"], operationId: "resendEnvelope", summary: "Re-send the signing email to waiting recipients", parameters: [ENV_ID], requestBody: { required: false, content: { "application/json": { schema: { type: "object", properties: { recipientId: { type: "string", format: "uuid", description: "Only this recipient" } } } } } }, responses: { "200": ok("Count resent", { type: "object", properties: { object: { const: "resend" }, envelopeId: { type: "string" }, resentTo: { type: "integer" } } }), ...errs(401, 403, 404, 409) } },
      },
      "/envelopes/{id}/recipients/{rid}/signing-link": {
        post: {
          tags: ["Recipients"], operationId: "createSigningLink", summary: "Issue a fresh signing URL for an active recipient",
          description: "For embedded or in-person signing. Only for recipients whose turn it is (status sent or delivered). Treat the URL as a secret.",
          parameters: [ENV_ID, idParam("rid", "Recipient id")],
          responses: { "200": ok("Signing link", ref("SigningLink")), ...errs(401, 403, 404, 409) },
        },
      },
      "/envelopes/{id}/documents/combined": {
        get: { tags: ["Documents"], operationId: "downloadCombined", summary: "Download the completed, sealed PDF (all documents + certificate)", parameters: [ENV_ID, { name: "download", in: "query", schema: { type: "string", enum: ["0", "1"] }, description: "0 = inline" }], responses: { "200": pdf("Sealed PDF"), ...errs(401, 403, 404, 409) } },
      },
      "/envelopes/{id}/certificate": {
        get: { tags: ["Documents"], operationId: "downloadCertificate", summary: "Download the Certificate of Completion", parameters: [ENV_ID, { name: "download", in: "query", schema: { type: "string", enum: ["0", "1"] } }], responses: { "200": pdf("Certificate PDF"), ...errs(401, 403, 404, 409) } },
      },
      "/envelopes/{id}/documents/{docId}": {
        get: { tags: ["Documents"], operationId: "downloadDocument", summary: "Download one original (unsigned, normalized) document", parameters: [ENV_ID, idParam("docId", "Document id"), { name: "download", in: "query", schema: { type: "string", enum: ["0", "1"] } }], responses: { "200": pdf("Document PDF"), ...errs(401, 403, 404) } },
      },
      "/envelopes/{id}/events": {
        get: { tags: ["Audit & comments"], operationId: "listEvents", summary: "Hash-chained audit trail", parameters: [ENV_ID], responses: { "200": ok("Events, oldest first", listOf("Event")), ...errs(401, 403, 404) } },
      },
      "/envelopes/{id}/comments": {
        get: { tags: ["Audit & comments"], operationId: "listComments", summary: "List comments", parameters: [ENV_ID], responses: { "200": ok("Comments", listOf("Comment")), ...errs(401, 403, 404) } },
        post: { tags: ["Audit & comments"], operationId: "addComment", summary: "Add a comment", description: "`internal` (default) is a team note; `everyone` is also visible to recipients.", parameters: [ENV_ID], requestBody: jsonBody({ type: "object", required: ["body"], properties: { body: { type: "string", maxLength: 4000 }, visibility: { type: "string", enum: ["internal", "everyone"], default: "internal" } } }), responses: { "201": ok("Comment", ref("Comment")), ...errs(400, 401, 403, 404) } },
      },
      "/webhooks": {
        get: { tags: ["Webhooks"], operationId: "listWebhooks", summary: "List webhooks (owners/admins)", responses: { "200": ok("Webhooks", listOf("Webhook")), ...errs(401, 403) } },
        post: { tags: ["Webhooks"], operationId: "createWebhook", summary: "Create a webhook (owners/admins)", description: "The signing `secret` is returned once.", requestBody: jsonBody({ type: "object", required: ["url"], properties: { url: { type: "string", format: "uri", pattern: "^https://" }, events: { type: "array", items: { type: "string", enum: WEBHOOK_EVENTS }, default: ["*"] }, description: { type: "string" } } }), responses: { "201": ok("Webhook with secret", { allOf: [ref("Webhook"), { type: "object", properties: { secret: { type: "string" } } }] }), ...errs(400, 401, 403) } },
      },
      "/webhooks/{id}": {
        delete: { tags: ["Webhooks"], operationId: "deleteWebhook", summary: "Delete a webhook", parameters: [idParam("id", "Webhook id")], responses: { "200": ok("Deleted", { type: "object", properties: { object: { const: "webhook" }, id: { type: "string" }, deleted: { const: true } } }), ...errs(401, 403, 404) } },
      },
      "/openapi.json": {
        get: { tags: ["Account"], operationId: "getOpenApi", summary: "This document", security: [], responses: { "200": ok("OpenAPI 3.1", { type: "object" }) } },
      },
    },
    webhooks: {
      envelopeEvent: {
        post: {
          summary: "Envelope / recipient / comment event",
          description: "Header `X-Imagine-Signature: t=<unix>,v1=<hex>` where v1 = HMAC-SHA256(secret, `${t}.${rawBody}`). Reject if t is older than 5 minutes. Retries with backoff (1m, 5m, 30m, 2h, 12h) until a 2xx.",
          requestBody: jsonBody(ref("WebhookPayload")),
          responses: { "200": { description: "Any 2xx acknowledges" } },
        },
      },
    },
    components: {
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "isk_...", description: "Personal API key from Settings > API keys" } },
      responses: Object.fromEntries(
        [[400, "Invalid request"], [401, "Missing, invalid, revoked or expired API key"], [403, "No access to this resource, or missing scope"], [404, "Not found"], [405, "Method not allowed"], [409, "Wrong state for this action (e.g. not a draft, not completed yet)"], [413, "PDF larger than 25 MB"], [422, "Couldn't process input (anchor not found, document URL failed)"], [500, "Server error"]]
          .map(([c, d]) => [`E${c}`, { description: d, content: { "application/json": { schema: ref("Error") } } }]),
      ),
      schemas: {
        Error: { type: "object", required: ["error"], properties: { error: { type: "object", required: ["code", "message"], properties: { code: { type: "string", examples: ["not_draft", "invalid_request", "anchor_not_found"] }, message: { type: "string" }, details: { type: "object" } } } } },
        Me: { type: "object", properties: { object: { const: "me" }, user: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, email: { type: "string" }, role: { type: "string", enum: ["owner", "admin", "member", "viewer"] }, timezone: { type: "string" } } }, workspace: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, slug: { type: "string" } } }, apiKey: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, prefix: { type: "string" }, scopes: { type: "array", items: { type: "string" } } } } } },
        TemplateSummary: { type: "object", properties: { object: { const: "template" }, id: { type: "string", format: "uuid" }, name: { type: "string" }, description: { type: "string" }, shared: { type: "boolean" }, owner: { type: "object", properties: { id: { type: "string" }, name: { type: "string" } } }, roles: { type: "array", items: { type: "string" } }, documentCount: { type: "integer" }, useCount: { type: "integer" }, lastUsedAt: { type: ["string", "null"], format: "date-time" } } },
        Template: {
          allOf: [ref("TemplateSummary"), {
            type: "object",
            properties: {
              subject: { type: "string" }, message: { type: "string" }, signingOrder: { type: "boolean" },
              roles: { type: "array", items: { type: "object", properties: { name: { type: "string" }, role: { type: "string", enum: ["signer", "cc", "viewer", "approver"] }, routingOrder: { type: "integer" }, defaultName: { type: ["string", "null"] }, defaultEmail: { type: ["string", "null"] }, hasAccessCode: { type: "boolean" }, fieldCount: { type: "integer" } } } },
              documents: { type: "array", items: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, pageCount: { type: "integer" } } } },
              fields: { type: "array", items: { type: "object", properties: { id: { type: "string" }, type: { type: "string", enum: FIELD_TYPES }, role: { type: ["string", "null"] }, document: { type: "integer" }, page: { type: "integer" }, label: { type: ["string", "null"] }, required: { type: "boolean" }, readOnly: { type: "boolean" }, value: { type: ["string", "null"] }, prefillable: { type: "boolean", description: "Use the label as a key in `prefill`" } } } },
            },
          }],
        },
        Recipient: { type: "object", properties: { id: { type: "string", format: "uuid" }, name: { type: "string" }, email: { type: "string" }, role: { type: "string", enum: ["signer", "cc", "viewer", "approver"] }, routingOrder: { type: "integer" }, templateRole: { type: ["string", "null"] }, status: { type: "string", enum: ["created", "sent", "delivered", "completed", "declined", "replaced"], description: "created = not their turn yet, sent = emailed, delivered = opened" }, hasAccessCode: { type: "boolean" }, sentAt: dt(), deliveredAt: dt(), completedAt: dt(), declinedAt: dt(), declineReason: { type: ["string", "null"] } } },
        Field: { type: "object", properties: { id: { type: "string" }, documentId: { type: "string" }, document: { type: "integer" }, recipientId: { type: "string" }, type: { type: "string", enum: FIELD_TYPES }, page: { type: "integer" }, x: { type: "number" }, y: { type: "number" }, width: { type: "number" }, height: { type: "number" }, required: { type: "boolean" }, readOnly: { type: "boolean" }, label: { type: ["string", "null"] }, value: { type: ["string", "null"], description: "Signature/initials show \"signed\" once filled" } } },
        Envelope: {
          type: "object",
          properties: {
            object: { const: "envelope" }, id: { type: "string", format: "uuid" },
            status: { type: "string", enum: ["draft", "sent", "completed", "declined", "voided", "expired"] },
            subject: { type: "string" }, message: { type: "string" }, createdVia: { type: "string" }, templateId: { type: ["string", "null"] },
            owner: { type: ["object", "null"], properties: { id: { type: "string" }, name: { type: "string" }, email: { type: "string" } } },
            signingOrder: { type: "boolean" }, visibility: { type: "string", enum: ["workspace", "private"] },
            reminderEnabled: { type: "boolean" }, expireAfterDays: { type: "integer" }, metadata: { type: "object" },
            createdAt: dt(), sentAt: dt(), expiresAt: dt(), completedAt: dt(), voidedAt: dt(), voidReason: { type: ["string", "null"] },
            completedSha256: { type: ["string", "null"], description: "SHA-256 of the sealed combined PDF" },
            documents: { type: "array", items: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, position: { type: "integer" }, pageCount: { type: "integer" }, pages: { type: "array", items: { type: "object", properties: { width: { type: "number" }, height: { type: "number" }, rotation: { type: "integer" } } } }, url: { type: "string" } } } },
            recipients: { type: "array", items: ref("Recipient") },
            fields: { type: "array", items: ref("Field") },
            links: { type: "object", properties: { app: { type: "string" }, self: { type: "string" }, combined: { type: ["string", "null"] }, certificate: { type: ["string", "null"] } } },
          },
        },
        EnvelopeSummary: { type: "object", properties: { object: { const: "envelope" }, id: { type: "string" }, status: { type: "string" }, subject: { type: "string" }, owner: { type: "object" }, recipients: { type: "array", items: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, email: { type: "string" }, role: { type: "string" }, status: { type: "string" }, routingOrder: { type: "integer" } } } }, actionRequired: { type: "boolean" }, sentAt: dt(), completedAt: dt(), lastActivityAt: dt(), links: { type: "object" } } },
        RecipientInput: { type: "object", properties: { id: { type: "string", format: "uuid", description: "PATCH: keep this existing recipient" }, name: { type: "string" }, email: { type: "string", format: "email" }, role: { type: "string", enum: ["signer", "cc", "viewer", "approver"], default: "signer" }, routingOrder: { type: "integer", minimum: 1, description: "Defaults to list position. Different orders turn on signing order." }, roleName: { type: "string", description: "Template role this person fills" }, privateMessage: { type: ["string", "null"] }, accessCode: { type: ["string", "null"], description: "Recipient must enter it before opening" } } },
        FieldInput: {
          type: "object", required: ["recipient", "type"],
          description: "Either explicit placement (`page`, `x`, `y`, optional `document`, `width`, `height`, all normalized 0..1, top-left origin) or `anchor` placement (`offsetX`/`offsetY`/`width`/`height` in PDF points from the anchor text's top-left; placed at every occurrence).",
          properties: {
            recipient: { oneOf: [{ type: "integer", minimum: 0 }, { type: "string" }], description: "0-based index into recipients, an email, a template role name, or a recipient id" },
            type: { type: "string", enum: FIELD_TYPES },
            document: { type: "integer", minimum: 0, default: 0 }, page: { type: "integer", minimum: 0 },
            x: { type: "number", minimum: 0, maximum: 1 }, y: { type: "number", minimum: 0, maximum: 1 }, width: { type: "number" }, height: { type: "number" },
            anchor: { type: "string", examples: ["/sig1/"] }, offsetX: { type: "number" }, offsetY: { type: "number" },
            required: { type: "boolean" }, readOnly: { type: "boolean" }, label: { type: "string" }, value: { type: "string" },
            options: { oneOf: [{ type: "array", items: { type: "string" } }, { type: "object" }], description: "Dropdown choices, or the full options object" },
            group: { type: "string", description: "Radio group" }, optionValue: { type: "string", description: "Radio option value" },
          },
        },
        DocumentInput: { type: "object", description: "Exactly one of base64, url, fileId. 25 MB max. Password-protected PDFs are rejected.", properties: { name: { type: "string" }, base64: { type: "string", contentEncoding: "base64" }, url: { type: "string", format: "uri", description: "Public https URL" }, fileId: { type: "string", format: "uuid" } } },
        CreateEnvelope: {
          type: "object",
          properties: {
            templateId: { type: "string", format: "uuid" },
            documents: { type: "array", items: ref("DocumentInput"), maxItems: 20 },
            recipients: { type: "array", items: ref("RecipientInput") },
            roles: { type: "array", description: "Template shorthand", items: { type: "object", required: ["role", "name", "email"], properties: { role: { type: "string" }, name: { type: "string" }, email: { type: "string" }, accessCode: { type: ["string", "null"] }, privateMessage: { type: ["string", "null"] } } } },
            fields: { type: "array", items: ref("FieldInput") },
            prefill: { type: "object", additionalProperties: { type: "string" }, description: "Template field label -> value" },
            ...settingsProps(),
            status: { type: "string", enum: ["draft", "sent"], default: "draft" },
          },
        },
        UpdateEnvelope: { type: "object", properties: { ...settingsProps(), recipients: { type: "array", items: ref("RecipientInput") }, fields: { type: "array", items: ref("FieldInput") } } },
        SigningLink: { type: "object", properties: { object: { const: "signing_link" }, envelopeId: { type: "string" }, recipientId: { type: "string" }, url: { type: "string" }, expiresAt: dt(), requiresAccessCode: { type: "boolean" } } },
        Event: { type: "object", properties: { id: { type: "integer" }, type: { type: "string" }, description: { type: "string" }, recipientId: { type: ["string", "null"] }, actorUserId: { type: ["string", "null"] }, actorApiKeyId: { type: ["string", "null"] }, ip: { type: ["string", "null"] }, createdAt: dt(), hash: { type: "string" }, prevHash: { type: ["string", "null"], description: "hash = sha256(prevHash + canonical event JSON)" } } },
        Comment: { type: "object", properties: { id: { type: "string" }, body: { type: "string" }, visibility: { type: "string", enum: ["internal", "everyone"] }, author: { type: "object", properties: { name: { type: ["string", "null"] }, email: { type: ["string", "null"] } } }, createdAt: dt() } },
        Webhook: { type: "object", properties: { object: { const: "webhook" }, id: { type: "string" }, url: { type: "string" }, events: { type: "array", items: { type: "string" } }, active: { type: "boolean" }, description: { type: "string" } } },
        WebhookPayload: { type: "object", properties: { id: { type: "string", description: "Delivery id, use for idempotency" }, type: { type: "string", enum: WEBHOOK_EVENTS.slice(1) }, createdAt: dt(), envelopeId: { type: ["string", "null"] }, data: { type: "object" } } },
      },
    },
  };
}

function dt() {
  return { type: ["string", "null"], format: "date-time" };
}

function listOf(schema: string) {
  return { type: "object", properties: { object: { const: "list" }, data: { type: "array", items: ref(schema) }, total: { type: "integer" } } };
}

function settingsProps() {
  return {
    subject: { type: "string", maxLength: 300 },
    message: { type: "string", maxLength: 10000 },
    signingOrder: { type: "boolean" },
    reminderEnabled: { type: "boolean" },
    reminderDelayDays: { type: "integer", minimum: 1, maximum: 60 },
    reminderFrequencyDays: { type: "integer", minimum: 1, maximum: 60 },
    expireAfterDays: { type: "integer", minimum: 1, maximum: 999 },
    expireWarnDays: { type: "integer", minimum: 0, maximum: 60 },
    allowReassign: { type: "boolean" },
    allowComments: { type: "boolean" },
    visibility: { type: "string", enum: ["workspace", "private"] },
    metadata: { type: "object", description: "Free-form, e.g. { \"hubspotDealId\": \"123\" }" },
  };
}
