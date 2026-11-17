# Imagine Sign: architecture

A DocuSign-style e-signature app (Home, Agreements, envelope builder, field tagger, signer experience,
templates, certificate of completion) plus a REST API and MCP server so agents can send and track
agreements. Each deployment is one self-hosted instance on the deployer's own Vercel + Supabase + Resend.
See README.md for setup.

## Stack

- Next.js 16 App Router, TypeScript, Tailwind v4, Radix primitives, lucide icons. No Cache Components.
- Postgres via `postgres` (postgres.js) through the Supavisor pooler, server only (`lib/db`).
- Supabase Auth (email one-time code, invited users only; the first login with OWNER_EMAIL creates the workspace) for internal users. Codes are emailed through Resend.
- Supabase Storage bucket `documents` (private) for every PDF / image. Browser uploads use signed upload URLs.
- pdf.js renders pages in the browser; `lib/pdf` (pdf-lib + @signpdf) flattens, stamps, certifies and seals on the server.
- Resend + React Email (`emails/`) for every notification; Resend webhooks feed `sign.emails` and the audit trail.
- Vercel Cron: `/api/cron/tick` (reminders, expirations, webhook retries). Daily by default so it works on the Hobby plan; every 15 min on Pro.
- PAdES seal: `SEAL_P12_BASE64` env or a self-signed certificate generated on first completion (`lib/seal.ts`, stored in `sign.instance_secrets`).
- Branding: `lib/brand.ts` (NEXT_PUBLIC_* env).

## Coordinates

Field positions are normalized to the displayed page (rotation applied), origin top-left, 0..1.
Never store pixels. The tagger, signer view, API and PDF engine all use the same convention.

## Domain model (see supabase/migrations)

- workspace -> users (owner/admin/member/viewer)
- envelope (draft -> sent -> completed | declined | voided | expired)
  - documents (ordered PDFs) / recipients (signer, cc, viewer, approver; routing_order) / fields
  - events: append-only, hash-chained audit trail (sha256(prev_hash + canonical event json))
  - comments (internal team notes or visible to everyone), collaborators (shared access), folders
- template -> template_documents / template_roles / template_fields
- api_keys (hashed, `isk_` prefix), webhooks + webhook_deliveries (HMAC-SHA256 signed), emails (Resend log)

Recipient status: created -> sent -> delivered (opened) -> completed | declined | replaced (reassigned).
Routing: the lowest routing_order with incomplete signers/approvers/viewers is active; cc get the
completed copy. Same routing_order = parallel.

## REST API v1 (Bearer `isk_...`)

Base `<APP_URL>/api/v1`. JSON. Errors: `{ "error": { "code", "message" } }`.

- `GET  /me`
- `GET  /templates` / `GET /templates/{id}`
- `POST /envelopes` create from `templateId` or `documents` (base64, url or fileId); `status: "draft" | "sent"`
- `GET  /envelopes?status=&q=&limit=&cursor=` / `GET /envelopes/{id}`
- `PATCH /envelopes/{id}` (draft only) / `DELETE /envelopes/{id}` (draft only)
- `POST /envelopes/{id}/send` / `POST /envelopes/{id}/void` `{reason}` / `POST /envelopes/{id}/resend`
- `POST /envelopes/{id}/recipients/{recipientId}/signing-link` -> fresh signing URL
- `GET  /envelopes/{id}/documents/combined` (completed PDF once complete) / `GET /envelopes/{id}/certificate`
- `GET  /envelopes/{id}/events` / `GET|POST /envelopes/{id}/comments`
- `GET|POST /webhooks` / `DELETE /webhooks/{id}`
- `GET  /openapi.json`

Fields in `POST /envelopes`: either explicit `{ recipient, document, page, x, y, width, height, type }`
(normalized) or anchor based `{ recipient, anchor: "/sig1/", offsetX, offsetY, width, height, type }`
where offsets are in points from the anchor's top-left. `recipient` is an index, an email or a
template role name.

Webhook events: `envelope.sent`, `envelope.delivered`, `recipient.viewed`, `recipient.signed`,
`recipient.declined`, `envelope.completed`, `envelope.voided`, `envelope.expired`, `comment.added`.
Header `X-Imagine-Signature: t=<unix>,v1=<hex hmac_sha256(secret, t + "." + body)>`.

## Local dev

```
pnpm i
cp .env.example .env.local   # fill in your Supabase + Resend values
pnpm migrate
pnpm dev
```
