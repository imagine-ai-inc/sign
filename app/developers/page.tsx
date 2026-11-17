import type { Metadata } from "next";
import Link from "next/link";
import { env } from "@/lib/env";
import { sections, WEBHOOK_EVENTS, ERROR_CODES, type Endpoint } from "./content";
import { CodeBlock } from "./code-block";
import { BrandLogo, PoweredBy } from "@/components/brand-logo";
import { brand } from "@/lib/brand";

export const metadata: Metadata = { title: "API and developer docs" };
export const dynamic = "force-dynamic";

const METHOD_STYLE: Record<Endpoint["method"], string> = {
  GET: "bg-[#E4F1EA] text-[#2F7A55] border-[#BFDCCB]",
  POST: "bg-blush-1 text-rose-ink border-blush-2",
  PATCH: "bg-[#FBF0D9] text-[#9A6A12] border-[#EFD9A8]",
  DELETE: "bg-[#F8E1E4] text-[#B23A48] border-[#EDBEC5]",
};

function Method({ m }: { m: Endpoint["method"] }) {
  return <span className={`inline-flex items-center justify-center min-w-[58px] h-[22px] px-2 rounded-[4px] border text-[11px] font-semibold tracking-wide ${METHOD_STYLE[m]}`}>{m}</span>;
}

function H2({ id, children, kicker }: { id: string; children: React.ReactNode; kicker?: string }) {
  return (
    <div id={id} className="scroll-mt-24 pt-14 first:pt-0">
      {kicker ? <div className="text-[12px] font-medium uppercase tracking-[0.08em] text-muted mb-2">{kicker}</div> : null}
      <h2 className="font-serif text-[34px] leading-[1.1] text-ink">{children}</h2>
    </div>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[15px] leading-[1.65] text-ink-2 mt-3 max-w-[68ch]">{children}</p>;
}

function C({ children }: { children: React.ReactNode }) {
  return <code className="font-mono text-[13px] bg-paper-2 border border-hairline-2 rounded px-1.5 py-[1px] text-ink">{children}</code>;
}

export default function DevelopersPage() {
  const appUrl = env.appUrl();
  const base = `${appUrl}/api/v1`;
  const mcpUrl = `${appUrl}/api/mcp`;
  const groups = sections(base);
  const support = env.supportEmail();

  const quickstart = [
    {
      title: "1. Find your template",
      code: `export IMAGINE_SIGN_API_KEY=isk_...\n\ncurl ${base}/templates \\\n  -H "Authorization: Bearer $IMAGINE_SIGN_API_KEY"`,
    },
    {
      title: "2. Create a draft with the roles filled in",
      code: `curl ${base}/envelopes \\\n  -H "Authorization: Bearer $IMAGINE_SIGN_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "templateId": "TEMPLATE_ID",\n    "roles": [{ "role": "Customer", "name": "Jordan Lee", "email": "jordan@example.com" }],\n    "prefill": { "Company": "Example Co" }\n  }'`,
    },
    {
      title: "3. Review it in the app, then send",
      code: `# open links.app from the response, check it, then:\ncurl -X POST ${base}/envelopes/ENVELOPE_ID/send \\\n  -H "Authorization: Bearer $IMAGINE_SIGN_API_KEY"`,
    },
    {
      title: "4. Wait for completion and download",
      code: `# poll, or subscribe to envelope.completed (see Webhooks)\ncurl ${base}/envelopes/ENVELOPE_ID \\\n  -H "Authorization: Bearer $IMAGINE_SIGN_API_KEY" | jq .status\n\ncurl ${base}/envelopes/ENVELOPE_ID/documents/combined \\\n  -H "Authorization: Bearer $IMAGINE_SIGN_API_KEY" -o signed.pdf`,
    },
  ];

  const verifyNode = `import crypto from "node:crypto";

// Use the RAW request body, before JSON parsing.
export function verifyImagineSign(rawBody, header, secret) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false; // 5 min tolerance
  const expected = crypto.createHmac("sha256", secret).update(\`\${t}.\${rawBody}\`).digest("hex");
  const a = Buffer.from(expected), b = Buffer.from(parts.v1 || "");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}`;

  const verifyPy = `import hmac, hashlib, time

def verify_imagine_sign(raw_body: bytes, header: str, secret: str) -> bool:
    parts = dict(p.split("=", 1) for p in header.split(","))
    t = int(parts.get("t", "0"))
    if abs(time.time() - t) > 300:
        return False
    expected = hmac.new(secret.encode(), f"{t}.".encode() + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, parts.get("v1", ""))`;

  const mcpJson = `{
  "mcpServers": {
    "imagine-sign": {
      "type": "http",
      "url": "${mcpUrl}",
      "headers": { "Authorization": "Bearer \${IMAGINE_SIGN_API_KEY}" }
    }
  }
}`;

  const nav: { id: string; label: string; children?: { id: string; label: string }[] }[] = [
    { id: "overview", label: "Overview" },
    { id: "auth", label: "Authentication" },
    { id: "quickstart", label: "Quickstart" },
    { id: "concepts", label: "Concepts" },
    ...groups.map((g) => ({ id: g.id, label: g.title, children: g.endpoints.map((e) => ({ id: e.id, label: e.title })) })),
    { id: "webhook-events", label: "Webhook events" },
    { id: "verify", label: "Verifying signatures" },
    { id: "errors", label: "Errors" },
    { id: "mcp", label: "MCP for AI agents" },
  ];

  return (
    <div className="min-h-screen bg-paper">
      <header className="h-16 bg-white border-b border-hairline sticky top-0 z-40">
        <div className="h-full max-w-[1280px] mx-auto px-6 flex items-center gap-6">
          <Link href="/" className="flex items-center gap-1.5 shrink-0" aria-label={`${brand.name} home`}>
            <BrandLogo imgClass="h-[26px]" textClass="text-[22px]" />
          </Link>
          <span className="hidden sm:inline text-[14px] font-medium text-ink-2 border-l border-hairline pl-6">Developers</span>
          <div className="ml-auto flex items-center gap-2">
            <a href={`${base}/openapi.json`} className="hidden sm:inline-flex h-9 items-center px-4 rounded-[6px] border border-hairline bg-white text-[14px] text-ink hover:bg-paper-2">OpenAPI spec</a>
            <Link href="/settings/api" className="inline-flex h-9 items-center px-4 rounded-[6px] bg-ink text-white text-[14px] hover:bg-[#2a2827]">Get an API key</Link>
          </div>
        </div>
      </header>

      <div className="max-w-[1280px] mx-auto px-6 flex gap-12">
        <aside className="hidden lg:block w-[230px] shrink-0">
          <nav className="sticky top-16 max-h-[calc(100vh-4rem)] overflow-y-auto py-10 pr-2 text-[13.5px]">
            <ul className="space-y-0.5">
              {nav.map((n) => (
                <li key={n.id}>
                  <a href={`#${n.id}`} className="block px-2 py-1.5 rounded text-ink font-medium hover:bg-paper-2">{n.label}</a>
                  {n.children ? (
                    <ul className="ml-2 border-l border-hairline-2 pl-2 mb-2">
                      {n.children.map((c) => (
                        <li key={c.id}><a href={`#${c.id}`} className="block px-2 py-1 rounded text-ink-2 hover:text-ink hover:bg-paper-2">{c.label}</a></li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        <main className="flex-1 min-w-0 py-12 pb-32">
          <section id="overview" className="scroll-mt-24">
            <div className="rounded-[10px] border border-hairline bg-blush-1 px-5 py-8 sm:px-8 sm:py-10 relative overflow-hidden">
              <div className="text-[12px] font-medium uppercase tracking-[0.08em] text-rose-ink">REST API v1</div>
              <h1 className="font-serif text-[40px] sm:text-[52px] leading-[1.02] text-ink mt-2">Build with {brand.name}</h1>
              <p className="text-[16px] leading-[1.6] text-ink-2 mt-4 max-w-[60ch]">
                Create, send and track agreements from your own code, a CRM workflow, or an AI agent. You can do everything from the app here:
                templates, routing order, anchor tags, the audit trail, webhooks, and the sealed completed PDF.
              </p>
              <div className="mt-6 flex flex-wrap gap-x-8 gap-y-2 text-[13.5px]">
                <div><span className="text-muted">Base URL </span><C>{base}</C></div>
                <div><span className="text-muted">MCP </span><C>{mcpUrl}</C></div>
                <div><span className="text-muted">Format </span><C>JSON</C></div>
              </div>
            </div>
          </section>

          <H2 id="auth" kicker="Start here">Authentication</H2>
          <P>
            To create a personal API key, go to <Link className="text-rose-ink underline underline-offset-2" href="/settings/api">Settings &gt; API keys</Link>. Keys begin with <C>isk_</C>. You see each key once,
            and we only store a hash of it. Send the key with every request:
          </P>
          <CodeBlock code={`Authorization: Bearer isk_...`} />
          <P>
            A key acts as the user who created it and has exactly that user&apos;s access. That covers their own envelopes, envelopes shared with the workspace, and
            envelopes where they are a collaborator. Revoke a key in Settings and it stops working immediately. Envelopes created with a key are marked
            <C>createdVia: &quot;api&quot;</C>, and the audit trail records which key acted.
          </P>

          <H2 id="quickstart" kicker="Five minutes">Quickstart: send an order form</H2>
          <P>The usual flow is to create a draft from a template, have a person check it, send it, and then collect the signed PDF.</P>
          <div className="grid gap-5 mt-6 [&>*]:min-w-0">
            {quickstart.map((s) => (
              <div key={s.title} className="min-w-0">
                <div className="text-[14px] font-medium text-ink mb-2">{s.title}</div>
                <CodeBlock code={s.code} />
              </div>
            ))}
          </div>

          <H2 id="concepts">Concepts</H2>
          <div className="grid sm:grid-cols-2 gap-4 mt-6 [&>*]:min-w-0">
            {[
              ["Envelope", "One or more documents, their recipients and their fields. An envelope moves from draft to sent, and ends as completed, declined, voided or expired."],
              ["Recipients and routing", "A recipient is a signer, approver, viewer or cc. The lowest routing order with work left goes first. Recipients who share a number sign in parallel. CC recipients get the completed copy."],
              ["Fields and coordinates", "Positions are normalized to the displayed page, so 0 to 1 with the origin at the top left. If that's awkward, put anchor text such as /sig1/ in your PDF (white text works) and place fields relative to it."],
              ["Completed PDF", "When an envelope completes, every page is stamped with the envelope ID, the Certificate of Completion is appended, and the file gets a PAdES seal. Its SHA-256 is completedSha256."],
            ].map(([t, d]) => (
              <div key={t} className="rounded-[8px] border border-hairline bg-white p-5">
                <div className="text-[14.5px] font-semibold text-ink">{t}</div>
                <div className="text-[14px] leading-[1.6] text-ink-2 mt-1.5">{d}</div>
              </div>
            ))}
          </div>

          {groups.map((g) => (
            <section key={g.id}>
              <H2 id={g.id} kicker="Endpoints">{g.title}</H2>
              <div className="mt-6 space-y-6">
                {g.endpoints.map((e) => (
                  <article key={e.id} id={e.id} className="scroll-mt-24 rounded-[10px] border border-hairline bg-white overflow-hidden">
                    <div className="px-6 py-4 border-b border-hairline-2 flex flex-wrap items-center gap-3">
                      <Method m={e.method} />
                      <code className="font-mono text-[14px] text-ink break-all">{e.path}</code>
                      <span className="ml-auto text-[14px] font-medium text-ink-2">{e.title}</span>
                    </div>
                    <div className="px-6 py-5">
                      <p className="text-[14.5px] leading-[1.65] text-ink-2 max-w-[75ch]">{e.description}</p>
                      {e.notes ? (
                        <ul className="mt-3 space-y-1.5 text-[14px] text-ink-2 list-disc pl-5 marker:text-rose-2">
                          {e.notes.map((n) => <li key={n}>{n}</li>)}
                        </ul>
                      ) : null}
                      <div className={`mt-4 grid gap-3 [&>*]:min-w-0 ${e.response && e.curl.split("\n").length < 6 ? "xl:grid-cols-2" : ""}`}>
                        <CodeBlock code={e.curl} label="Request" />
                        {e.response ? <CodeBlock code={e.response} label="Response" /> : null}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}

          <H2 id="webhook-events" kicker="Webhooks">Events</H2>
          <P>
            Each delivery is a POST with a JSON body <C>{`{ id, type, createdAt, envelopeId, data }`}</C>. Use <C>id</C> to make your handler idempotent. Any 2xx response
            acknowledges the delivery. Other responses are retried after 1 minute, 5 minutes, 30 minutes, 2 hours and 12 hours.
          </P>
          <div className="mt-5 rounded-[10px] border border-hairline bg-white divide-y divide-hairline-2">
            {WEBHOOK_EVENTS.map(([name, d]) => (
              <div key={name} className="px-5 py-3 flex flex-wrap gap-x-6 gap-y-1 text-[14px]">
                <code className="font-mono text-[13px] text-ink w-[200px] shrink-0">{name}</code>
                <span className="text-ink-2">{d}</span>
              </div>
            ))}
          </div>

          <H2 id="verify">Verifying signatures</H2>
          <P>
            Every delivery is signed with <C>{`X-Imagine-Signature: t=<unix>,v1=<hex>`}</C>, where <C>v1</C> is the HMAC-SHA256 of <C>{"`${t}.${rawBody}`"}</C> keyed with the webhook&apos;s secret.
            Compare the values in constant time, and reject timestamps more than 5 minutes old.
          </P>
          <div className="grid gap-3 xl:grid-cols-2 mt-5 [&>*]:min-w-0">
            <CodeBlock code={verifyNode} label="Node.js" />
            <CodeBlock code={verifyPy} label="Python" />
          </div>

          <H2 id="errors">Errors</H2>
          <P>
            Errors use standard HTTP status codes with the body <C>{`{ "error": { "code", "message" } }`}</C>. <C>code</C> is stable, so branch on it. <C>message</C> is
            written for people and can be shown as is.
          </P>
          <div className="mt-5 rounded-[10px] border border-hairline bg-white overflow-hidden">
            <table className="w-full text-[14px]">
              <thead className="bg-paper text-left text-[12px] uppercase tracking-[0.06em] text-muted">
                <tr><th className="px-5 py-2.5 font-medium">Code</th><th className="px-5 py-2.5 font-medium">HTTP</th><th className="px-5 py-2.5 font-medium">Meaning</th></tr>
              </thead>
              <tbody className="divide-y divide-hairline-2">
                {ERROR_CODES.map(([code, status, d]) => (
                  <tr key={code}><td className="px-5 py-2.5"><code className="font-mono text-[13px]">{code}</code></td><td className="px-5 py-2.5 text-ink-2">{status}</td><td className="px-5 py-2.5 text-ink-2">{d}</td></tr>
                ))}
              </tbody>
            </table>
          </div>

          <H2 id="mcp" kicker="AI agents">MCP server</H2>
          <P>
            {brand.name} also runs a Model Context Protocol server (Streamable HTTP), so Claude, Cursor and other MCP clients can work with agreements directly.
            It uses the same API key and runs on the same handlers as the REST API, so permissions, validation and the audit trail are identical.
          </P>
          <div className="grid gap-3 xl:grid-cols-2 mt-5 [&>*]:min-w-0">
            <CodeBlock code={mcpJson} label=".mcp.json (Claude Code, Cursor)" />
            <CodeBlock code={`claude mcp add --transport http imagine-sign ${mcpUrl} \\\n  --header "Authorization: Bearer $IMAGINE_SIGN_API_KEY"`} label="Claude Code CLI" />
          </div>
          <P>
            The server has 13 tools: <C>whoami</C>, <C>list_templates</C>, <C>get_template</C>, <C>create_envelope</C>, <C>send_envelope</C>, <C>get_envelope</C>, <C>list_envelopes</C>,
            <C>void_envelope</C>, <C>resend_envelope</C>, <C>get_signing_link</C>, <C>download_completed</C>, <C>add_comment</C> and <C>list_comments</C>.
            <C>create_envelope</C> makes a draft by default. Agents should show a person the draft and send it only after that person explicitly says yes.
          </P>

          <div className="mt-20 pt-6 border-t border-hairline text-[13px] text-muted flex flex-wrap gap-4">
            <span>{brand.name}</span>
            <PoweredBy />
            <a className="hover:text-ink" href={`${base}/openapi.json`}>OpenAPI 3.1</a>
            {support ? <a className="hover:text-ink" href={`mailto:${support}`}>{support}</a> : null}
          </div>
        </main>
      </div>
    </div>
  );
}
