/** Content for the public /developers page. Examples use example.com data only. */

export interface Endpoint {
  id: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  title: string;
  description: string;
  curl: string;
  response?: string;
  notes?: string[];
}

export interface Section {
  id: string;
  title: string;
  endpoints: Endpoint[];
}

const B = "$IMAGINE_SIGN_API_KEY";
const H = `-H "Authorization: Bearer ${B}"`;
const J = `-H "Content-Type: application/json"`;

export function sections(base: string): Section[] {
  return [
    {
      id: "account",
      title: "Account",
      endpoints: [
        {
          id: "get-me", method: "GET", path: "/me", title: "Who am I",
          description: "Returns the user and workspace the key belongs to, plus the key's scopes. Call this first to check a key works.",
          curl: `curl ${base}/me \\\n  ${H}`,
          response: `{
  "object": "me",
  "user": { "id": "…", "name": "Alex Kim", "email": "alex@example.com", "role": "member", "timezone": "America/Los_Angeles" },
  "workspace": { "id": "…", "name": "Acme Inc", "slug": "acme-inc" },
  "apiKey": { "id": "…", "name": "CRM sync", "prefix": "isk_3fQx9a", "scopes": ["envelopes:read", "envelopes:write", "templates:read", "templates:write"] }
}`,
        },
      ],
    },
    {
      id: "templates",
      title: "Templates",
      endpoints: [
        {
          id: "list-templates", method: "GET", path: "/templates", title: "List templates",
          description: "Templates you own plus templates shared with the workspace. Filter with q (name or description) and scope (all, mine or shared).",
          curl: `curl "${base}/templates?q=order" \\\n  ${H}`,
          response: `{ "object": "list", "total": 1, "data": [
  { "object": "template", "id": "6a1f…", "name": "SaaS Services Order Form", "roles": ["Customer", "Acme Inc"], "documentCount": 1, "shared": true }
] }`,
        },
        {
          id: "get-template", method: "GET", path: "/templates/{id}", title: "Get a template",
          description: "Roles (name, routing order, default recipient), documents, and every field. Fields where prefillable is true can be filled at creation time through prefill, keyed by the field's label.",
          curl: `curl ${base}/templates/6a1f… \\\n  ${H}`,
          response: `{
  "object": "template", "id": "6a1f…", "name": "SaaS Services Order Form",
  "roles": [
    { "name": "Customer", "role": "signer", "routingOrder": 1, "defaultName": null, "defaultEmail": null, "fieldCount": 4 },
    { "name": "Acme Inc", "role": "signer", "routingOrder": 2, "defaultName": "Alex Kim", "defaultEmail": "alex@example.com", "fieldCount": 2 }
  ],
  "fields": [ { "type": "text", "role": "Customer", "label": "Company", "prefillable": true, "page": 0 }, … ]
}`,
        },
      ],
    },
    {
      id: "envelopes",
      title: "Envelopes",
      endpoints: [
        {
          id: "create-from-template", method: "POST", path: "/envelopes", title: "Create from a template",
          description: "Fill each template role with a person. Template fields carry over, and prefill sets labeled fields. The envelope starts as a draft unless you pass \"status\": \"sent\".",
          curl: `curl ${base}/envelopes \\\n  ${H} ${J} \\\n  -d '{
    "templateId": "6a1f…",
    "subject": "Acme Inc x Example Co - Order Form",
    "message": "Hi Jordan, here is the order form we discussed.",
    "roles": [
      { "role": "Customer",   "name": "Jordan Lee", "email": "jordan@example.com" },
      { "role": "Acme Inc", "name": "Alex Kim",   "email": "alex@example.com" }
    ],
    "prefill": { "Company": "Example Co", "Seats": "3" },
    "metadata": { "crmDealId": "D-1042" },
    "status": "draft"
  }'`,
          response: `HTTP/1.1 201 Created
{
  "object": "envelope", "id": "2b9c…", "status": "draft",
  "recipients": [ { "id": "r_1…", "name": "Jordan Lee", "role": "signer", "routingOrder": 1, "status": "created" }, … ],
  "links": { "app": "${base.replace(/\/api\/v1$/, "")}/envelopes/2b9c…/prepare", "self": "${base}/envelopes/2b9c…" }
}`,
        },
        {
          id: "create-from-pdf", method: "POST", path: "/envelopes", title: "Create from a PDF",
          description: "Send documents (base64, a public https url, or a fileId), recipients, and fields. A field is placed either explicitly with page, x, y, width and height (normalized 0 to 1, top-left origin), or by anchor text in the PDF. Anchor offsets and sizes are in points, and a field is placed at every occurrence of its anchor.",
          curl: `curl ${base}/envelopes \\\n  ${H} ${J} \\\n  -d '{
    "subject": "Mutual NDA - Acme Inc x Example Co",
    "documents": [ { "name": "NDA.pdf", "url": "https://example.com/nda.pdf" } ],
    "recipients": [
      { "name": "Jordan Lee", "email": "jordan@example.com", "routingOrder": 1 },
      { "name": "Alex Kim",   "email": "alex@example.com",   "routingOrder": 2 }
    ],
    "fields": [
      { "recipient": 0, "type": "signature",   "anchor": "/sig1/", "offsetY": -4 },
      { "recipient": 0, "type": "date_signed", "anchor": "/date1/" },
      { "recipient": "alex@example.com", "type": "signature", "page": 1, "x": 0.12, "y": 0.78, "width": 0.25, "height": 0.05 }
    ]
  }'`,
          notes: [
            "recipient can be a 0-based index, an email, a template role name, or a recipient id.",
            "Different routing orders turn on signing order. Recipients with the same number sign in parallel.",
            "Creation is atomic. If anything fails (a bad PDF, a missing anchor), nothing is left behind.",
            "Roles: signer, approver, viewer, cc. CC recipients get the completed copy and can't have fields.",
          ],
        },
        {
          id: "list-envelopes", method: "GET", path: "/envelopes", title: "List and search",
          description: "Newest activity first. status accepts draft, sent (in progress), completed, declined, voided, expired, action_required, waiting, expiring or deleted, or a folder id. q matches the subject, recipient names and emails, and the envelope id. To page, pass nextCursor back as cursor.",
          curl: `curl "${base}/envelopes?status=sent&q=example.com&limit=20" \\\n  ${H}`,
          response: `{ "object": "list", "total": 42, "hasMore": true, "nextCursor": "bzoyMA", "data": [ { "id": "2b9c…", "status": "sent", "subject": "…", "recipients": [ … ] } ] }`,
        },
        {
          id: "get-envelope", method: "GET", path: "/envelopes/{id}", title: "Get an envelope",
          description: "The full envelope: settings, documents (with page sizes), recipients and their timestamps, and fields. Signature values show as \"signed\" and are never returned as images.",
          curl: `curl ${base}/envelopes/2b9c… \\\n  ${H}`,
        },
        {
          id: "update-envelope", method: "PATCH", path: "/envelopes/{id}", title: "Update a draft",
          description: "Change settings, recipients or fields on a draft. When you send recipients or fields, the whole list is replaced. Include a recipient's id to keep that recipient. Returns 409 not_draft once the envelope has been sent.",
          curl: `curl -X PATCH ${base}/envelopes/2b9c… \\\n  ${H} ${J} \\\n  -d '{ "subject": "Updated subject", "expireAfterDays": 30, "reminderFrequencyDays": 2 }'`,
        },
        {
          id: "delete-envelope", method: "DELETE", path: "/envelopes/{id}", title: "Delete",
          description: "A draft is purged. A finished envelope moves to Deleted. An in-progress envelope has to be voided first.",
          curl: `curl -X DELETE ${base}/envelopes/2b9c… \\\n  ${H}`,
        },
        {
          id: "send-envelope", method: "POST", path: "/envelopes/{id}/send", title: "Send",
          description: "Validates the draft and then emails the first routing group. To pass validation, the draft needs at least one document, a signature field for every signer, and a subject. Problems come back as 400 invalid_envelope with a readable list.",
          curl: `curl -X POST ${base}/envelopes/2b9c…/send \\\n  ${H}`,
        },
        {
          id: "void-envelope", method: "POST", path: "/envelopes/{id}/void", title: "Void",
          description: "Stops an in-progress envelope. Signing links stop working, and recipients who already received it get an email with your reason.",
          curl: `curl ${base}/envelopes/2b9c…/void \\\n  ${H} ${J} \\\n  -d '{ "reason": "Pricing changed, sending a new version" }'`,
        },
        {
          id: "resend-envelope", method: "POST", path: "/envelopes/{id}/resend", title: "Resend",
          description: "Emails a fresh signing link to everyone whose turn it is, or only to recipientId.",
          curl: `curl -X POST ${base}/envelopes/2b9c…/resend \\\n  ${H}`,
          response: `{ "object": "resend", "envelopeId": "2b9c…", "resentTo": 1 }`,
        },
      ],
    },
    {
      id: "recipients",
      title: "Recipients",
      endpoints: [
        {
          id: "signing-link", method: "POST", path: "/envelopes/{id}/recipients/{recipientId}/signing-link", title: "Get a signing link",
          description: "A fresh signing URL for in-person or embedded signing. It only works for a recipient whose turn it is (status sent or delivered). Anyone who has the URL can sign as that recipient, so keep it secret.",
          curl: `curl -X POST ${base}/envelopes/2b9c…/recipients/r_1…/signing-link \\\n  ${H}`,
          response: `{ "object": "signing_link", "url": "${base.replace(/\/api\/v1$/, "")}/s/…", "expiresAt": "2027-02-03T19:00:00.000Z", "requiresAccessCode": false }`,
        },
      ],
    },
    {
      id: "documents",
      title: "Documents",
      endpoints: [
        {
          id: "download-combined", method: "GET", path: "/envelopes/{id}/documents/combined", title: "Download the completed PDF",
          description: "All documents with fields flattened, the envelope ID stamped on every page, and the Certificate of Completion appended. The file carries a PAdES digital seal. Before completion this returns 409 not_completed. For a few seconds after completion it can return 409 not_ready with a Retry-After header.",
          curl: `curl -L ${base}/envelopes/2b9c…/documents/combined \\\n  ${H} -o completed.pdf`,
        },
        {
          id: "download-certificate", method: "GET", path: "/envelopes/{id}/certificate", title: "Download the certificate",
          description: "The Certificate of Completion alone, sealed.",
          curl: `curl ${base}/envelopes/2b9c…/certificate \\\n  ${H} -o certificate.pdf`,
        },
        {
          id: "download-document", method: "GET", path: "/envelopes/{id}/documents/{docId}", title: "Download an original",
          description: "One uploaded document as it was sent (normalized and unsigned). Document ids come from GET /envelopes/{id}.",
          curl: `curl ${base}/envelopes/2b9c…/documents/d_1… \\\n  ${H} -o original.pdf`,
        },
      ],
    },
    {
      id: "audit",
      title: "Audit trail and comments",
      endpoints: [
        {
          id: "events", method: "GET", path: "/envelopes/{id}/events", title: "Audit trail",
          description: "Every event, oldest first, with IP and actor. The trail is hash-chained: each event's hash is sha256(prevHash + canonical event JSON), so you can check that nothing was edited or removed.",
          curl: `curl ${base}/envelopes/2b9c…/events \\\n  ${H}`,
        },
        {
          id: "list-comments", method: "GET", path: "/envelopes/{id}/comments", title: "List comments",
          description: "Team notes and comments that recipients can see.",
          curl: `curl ${base}/envelopes/2b9c…/comments \\\n  ${H}`,
        },
        {
          id: "add-comment", method: "POST", path: "/envelopes/{id}/comments", title: "Add a comment",
          description: "visibility is internal (a team-only note, the default) or everyone. The envelope owner and collaborators get an email.",
          curl: `curl ${base}/envelopes/2b9c…/comments \\\n  ${H} ${J} \\\n  -d '{ "body": "Customer asked for net-45, approved by finance.", "visibility": "internal" }'`,
        },
      ],
    },
    {
      id: "webhooks",
      title: "Webhooks",
      endpoints: [
        {
          id: "create-webhook", method: "POST", path: "/webhooks", title: "Create a webhook",
          description: "Workspace owners and admins only. The URL must be https. events defaults to [\"*\"]. The signing secret is returned once, so store it.",
          curl: `curl ${base}/webhooks \\\n  ${H} ${J} \\\n  -d '{ "url": "https://example.com/hooks/imagine-sign", "events": ["envelope.completed", "recipient.declined"] }'`,
          response: `HTTP/1.1 201 Created
{ "object": "webhook", "id": "w_1…", "events": ["envelope.completed", "recipient.declined"], "secret": "whsec_…" }`,
        },
        { id: "list-webhooks", method: "GET", path: "/webhooks", title: "List webhooks", description: "Secrets are only previewed here.", curl: `curl ${base}/webhooks \\\n  ${H}` },
        { id: "delete-webhook", method: "DELETE", path: "/webhooks/{id}", title: "Delete a webhook", description: "Stops deliveries immediately.", curl: `curl -X DELETE ${base}/webhooks/w_1… \\\n  ${H}` },
      ],
    },
  ];
}

export const WEBHOOK_EVENTS: [string, string][] = [
  ["envelope.sent", "A draft was sent"],
  ["recipient.viewed", "A recipient opened the envelope"],
  ["recipient.signed", "A recipient finished (signed, approved or viewed)"],
  ["recipient.declined", "A recipient declined to sign"],
  ["recipient.reassigned", "A recipient handed off to someone else"],
  ["envelope.completed", "Everyone finished. The sealed PDF is ready"],
  ["envelope.voided", "The sender voided the envelope"],
  ["envelope.expired", "The envelope expired before completion"],
  ["envelope.corrected", "A sent envelope's recipients or settings were corrected"],
  ["comment.added", "A comment was added"],
];

export const ERROR_CODES: [string, number, string][] = [
  ["unauthorized", 401, "The key is missing, invalid, revoked or expired"],
  ["insufficient_scope", 403, "The key doesn't have the scope this endpoint needs"],
  ["forbidden", 403, "You can't see or edit this envelope"],
  ["not_found", 404, "There's no such envelope, template, recipient or route"],
  ["invalid_request", 400, "The body failed validation. details.issues lists every problem"],
  ["invalid_envelope", 400, "The draft isn't ready to send. The message says what's missing"],
  ["not_draft", 409, "Only drafts can be edited or sent"],
  ["not_in_progress", 409, "Void, resend and signing links need an in-progress envelope"],
  ["not_completed", 409, "The completed PDF and certificate exist only after completion"],
  ["anchor_not_found", 422, "An anchor string doesn't appear in any document"],
  ["pdf_encrypted", 400, "The PDF is password protected"],
  ["pdf_too_large", 413, "The document is over 25 MB"],
];
