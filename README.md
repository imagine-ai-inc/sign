# Imagine Sign

A full DocuSign-style e-signature tool that we built and use every day at [Imagine AI](https://useimagine.ai) for our own order forms, NDAs and contracts. It's free and open source. You deploy it to **your own** Vercel, Supabase and Resend accounts, so your documents stay in your own cloud and there's no per-seat price.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fimagine-ai-inc%2Fimagine-sign&project-name=imagine-sign&repository-name=imagine-sign&env=OWNER_EMAIL,RESEND_API_KEY,EMAIL_FROM_ADDRESS,TOKEN_PEPPER,CRON_SECRET&envDescription=OWNER_EMAIL%20is%20your%20login%20(first%20login%20creates%20the%20workspace).%20RESEND_API_KEY%20%2B%20EMAIL_FROM_ADDRESS%20(on%20a%20verified%20Resend%20domain)%20send%20login%20codes%20and%20signing%20emails.%20TOKEN_PEPPER%20and%20CRON_SECRET%3A%20any%20long%20random%20strings%20(openssl%20rand%20-hex%2032).&envLink=https%3A%2F%2Fgithub.com%2Fimagine-ai-inc%2Fimagine-sign%23environment-variables&stores=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22supabase%22%2C%22productSlug%22%3A%22supabase%22%2C%22protocol%22%3A%22storage%22%7D%5D)

<!-- Screenshots: replace with real captures before publishing -->
| Home | Field tagger | Signer view | Certificate |
| --- | --- | --- | --- |
| ![Home](docs/screenshots/home.png) | ![Tagger](docs/screenshots/tagger.png) | ![Signer](docs/screenshots/signer.png) | ![Certificate](docs/screenshots/certificate.png) |

## Features

- **Envelopes**: upload one or more PDFs, add signers, approvers, viewers and CCs, set signing order (sequential or parallel), private messages, access codes, reminders and expiration.
- **Drag-and-drop field tagger**: signature, initials, date signed, name, email, company, title, text, number, date, checkbox, radio, dropdown, note, attachments and company stamps, with required/read-only, formulas and conditional fields.
- **Signer experience** that works on phones: adopt a drawn, typed or uploaded signature, guided "next field" flow, decline, reassign, print and download.
- **Templates** with roles and prefilled values, shared with your workspace or kept private.
- **Agreements** list with folders, search, filters, favorites, comments and a full activity trail.
- **Completed PDF**: fields flattened into the document, a Certificate of Completion with every event, IP and timestamp, a hash-chained audit trail, and a PAdES digital seal.
- **Verify page**: anyone can drop a PDF to check it against the completed record (the file never leaves their browser).
- **Email notifications** through Resend: signing requests, reminders, completed copies with the PDF attached, declines, voids, comments, expiration warnings.
- **REST API v1** with per-user `isk_` keys, OpenAPI spec, and HMAC-signed webhooks.
- **MCP server** so Claude, Cursor or your own agents can create, send and track envelopes.
- **Users and roles** (owner, admin, member, viewer), invite-only login with emailed one-time codes.
- **Your brand**: product name, logo, sender name and accent colors come from env vars.

## How it runs

| Piece | Service | What it does |
| --- | --- | --- |
| App | Vercel (Next.js 16) | UI, API, MCP, PDF rendering and sealing |
| Database + login + files | Supabase | Postgres schema `sign`, email-code auth, private `documents` storage bucket |
| Email | Resend | Login codes and every notification |
| Cron | Vercel Cron | `/api/cron/tick`: reminders, expirations, webhook retries |

Database migrations run automatically before every Vercel build (`pnpm run migrate && pnpm run build`), including creating the `documents` bucket. The seal certificate is generated on first use if you don't bring one.

## Deploy (about 10 minutes)

1. **Resend**: create an account, [add and verify a domain](https://resend.com/domains) you own (e.g. `sign.yourcompany.com` or `yourcompany.com`), and create an API key. Pick a from-address on that domain, like `sign@yourcompany.com`.
2. **Click "Deploy with Vercel"** above. Vercel will:
   - copy this repo into your GitHub account,
   - ask you to create (or connect) a **Supabase** database through the Vercel Marketplace. This fills in all the Supabase and Postgres env vars for you,
   - ask for the five values below.
3. Fill in the required env vars:
   - `OWNER_EMAIL`: your own email. The first login with this address creates your workspace and makes you the owner.
   - `RESEND_API_KEY` and `EMAIL_FROM_ADDRESS` from step 1.
   - `TOKEN_PEPPER` and `CRON_SECRET`: long random strings. Run `openssl rand -hex 32` twice.
4. Deploy. When it's live, open the URL, enter `OWNER_EMAIL`, type the code from your inbox, and you're in.
5. **Recommended**: in Vercel > Settings > Environment Variables set `APP_URL` to your final URL (e.g. `https://sign.yourcompany.com` once you add a custom domain) and redeploy. Signing links in emails use it.
6. Invite your team from **Settings > Users**. Nobody else can log in. People you send documents to don't need an account.

### Cron

`vercel.json` runs `/api/cron/tick` **once a day** so the project deploys on Vercel's Hobby plan. On Pro, change the schedule to `*/15 * * * *` for faster reminders, expirations and webhook retries. Vercel sends `CRON_SECRET` automatically; the route refuses to run in production without it.

### Supabase without the Marketplace

If you'd rather use an existing Supabase project, skip the integration and set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `DATABASE_URL` yourself (use the **pooler** connection string, Settings > Database > Connection string > Transaction pooler).

### Run it locally

```bash
pnpm install
cp .env.example .env.local   # fill in Supabase + Resend values
pnpm migrate                 # creates the sign schema and the documents bucket
pnpm dev                     # http://localhost:3000, log in with OWNER_EMAIL
```

## Environment variables

**Required**

| Variable | Example | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xyz.supabase.co` | Set by the Supabase integration |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` *or* `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `eyJ...` / `sb_publishable_...` | Set by the integration |
| `SUPABASE_SERVICE_ROLE_KEY` *or* `SUPABASE_SECRET_KEY` | `eyJ...` / `sb_secret_...` | Server only. Set by the integration |
| `DATABASE_URL` *or* `POSTGRES_URL` | `postgres://postgres.xyz:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres` | Pooler URL. `POSTGRES_URL` is set by the integration |
| `OWNER_EMAIL` | `you@yourcompany.com` | First login with this email creates the workspace + owner. Ignored once an owner exists |
| `RESEND_API_KEY` | `re_...` | Login codes and all notifications |
| `EMAIL_FROM_ADDRESS` | `sign@yourcompany.com` | Must be on a domain verified in Resend |
| `TOKEN_PEPPER` | 64 hex chars | HMAC key for signing links and access codes. Don't change it later (old links stop working) |
| `CRON_SECRET` | 64 hex chars | Protects `/api/cron/tick` |

**Optional**

| Variable | Default | Notes |
| --- | --- | --- |
| `APP_URL` | Vercel production URL | Public base URL used in emails and API docs |
| `DATABASE_URL_SESSION` | `DATABASE_URL` | Session-pooler URL used only by migrations |
| `WORKSPACE_NAME` | `NEXT_PUBLIC_COMPANY_NAME` or "My workspace" | Name of the workspace created on first login |
| `EMAIL_FROM_NAME` | brand name | From-name on system emails. Envelope emails read "<Sender> via <brand>" |
| `NEXT_PUBLIC_BRAND_NAME` | `Imagine Sign` | Product name everywhere: UI, emails, PDFs. The signature stamp label follows it ("Acme Sign" -> "Acme Signed by:") |
| `NEXT_PUBLIC_COMPANY_NAME` | empty | Your legal name, used in footers, the e-sign disclosure and the seal |
| `NEXT_PUBLIC_BRAND_LOGO` | stock logo | Header logo (URL or `/public` path). With a custom name and no logo, the name is shown as text |
| `NEXT_PUBLIC_BRAND_EMAIL_LOGO` | stock logo | PNG for emails (about 448x140) |
| `NEXT_PUBLIC_BRAND_MARK` | `/brand/imagine-mark.svg` | Favicon and small mark |
| `NEXT_PUBLIC_STAMP_LABEL` | "<brand>ed by:" | Override the label above signatures |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | `EMAIL_FROM_ADDRESS` | Contact address in API errors, docs and the disclosure |
| `NEXT_PUBLIC_SHOW_POWERED_BY` | `true` | Set `false` to hide the small "Built by Imagine AI" link |
| `BRAND_ACCENT_COLOR` | `#f6a1a8` | Highlight color (hex) |
| `BRAND_ACCENT_INK` | `#955c67` | Small accents and links (hex) |
| `SEAL_P12_BASE64` / `SEAL_P12_PASSPHRASE` | auto | Your own seal certificate. Without them a self-signed one is generated once and stored in your database. `pnpm generate-seal ./seal.p12 "Acme Sign" "Acme Inc."` makes one |
| `SEAL_AUTO_GENERATE` | `true` | `false` = don't seal when no P12 is set |
| `SEAL_LOCATION` | empty | Location written into the seal |
| `SKIP_MIGRATIONS` | unset | `1` skips the pre-build migration step |

`NEXT_PUBLIC_*` values are baked in at build time, so redeploy after changing them.

## API and agents

Every instance serves human docs at `/developers`, an OpenAPI spec at `/api/v1/openapi.json` and an MCP endpoint at `/api/mcp`. Create a key under **Settings > API keys**. See [docs/agents.md](docs/agents.md) for MCP setup and [ARCHITECTURE.md](ARCHITECTURE.md) for the data model.

## Seal certificate

Completed PDFs are sealed with a PAdES signature so any change after completion is detectable. The auto-generated certificate is self-signed, so Adobe Reader shows the signature as "validity unknown" until the recipient trusts it. If you want Adobe's green check, buy a document-signing certificate on the Adobe Approved Trust List (AATL) and put it in `SEAL_P12_BASE64` / `SEAL_P12_PASSPHRASE`.

## Legal note

Imagine Sign is software, not a signing service. When you deploy it, **you** are the operator: you're responsible for making sure your use meets the e-signature laws and regulations that apply to you and your signers (for example the U.S. ESIGN Act and UETA, eIDAS in the EU, and any industry-specific rules), for the consent disclosure you show signers (edit it under **Settings > Signing**), and for keeping your records. Some document types can't be signed electronically in some places. Imagine AI doesn't host your instance, can't see your documents, and gives no legal advice or warranty (see [LICENSE](LICENSE)).

## License

[MIT](LICENSE) © Imagine AI Inc.
