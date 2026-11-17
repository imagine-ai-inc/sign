import { brand } from "@/lib/brand";
import "server-only";
import { sql } from "@/lib/db";
import * as E from "@/lib/services/envelopes";
import * as T from "@/lib/services/templates";
import * as U from "@/lib/services/users";
import { WEBHOOK_EVENTS } from "@/lib/services/webhooks";
import { assertEdit, assertView } from "@/lib/services/access";
import { issueSigningToken, signingUrl } from "@/lib/services/notify";
import { appendEvent } from "@/lib/audit";
import { readFileBytes } from "@/lib/storage";
import type { EnvelopeDocument, Recipient } from "@/lib/types";
import { authenticate, requireAdminActor, requireScope, type ApiActor } from "@/lib/api/auth";
import { ApiError, json, pdfResponse, readJson, toErrorResponse } from "@/lib/api/http";
import { commentBody, createEnvelopeBody, patchEnvelopeBody, resendBody, voidBody, webhookBody } from "@/lib/api/schemas";
import { serializeBundle, serializeComment, serializeEvent, serializeListRow, serializeTemplateDetail, serializeTemplateRow, apiBase } from "@/lib/api/serialize";
import { createEnvelope, patchEnvelope } from "@/lib/api/envelopes";
import { listForApi } from "@/lib/api/list";
import { decodeCursor, encodeCursor, isUuid, segments, statusToFolder, STATUS_FILTERS } from "@/lib/api/util";
import { buildOpenApi } from "@/lib/api/openapi";

type Method = "GET" | "POST" | "PATCH" | "DELETE";
type Params = Record<string, string>;
type Handler = (ctx: { req: Request; url: URL; actor: ApiActor; params: Params }) => Promise<Response>;

interface Route { method: Method; pattern: string[]; handler: Handler }

const routes: Route[] = [];
function route(method: Method, path: string, handler: Handler) {
  routes.push({ method, pattern: path.split("/").filter(Boolean), handler });
}

function match(pattern: string[], segs: string[]): Params | null {
  if (pattern.length !== segs.length) return null;
  const params: Params = {};
  for (let i = 0; i < pattern.length; i++) {
    const p = pattern[i];
    if (p.startsWith(":")) params[p.slice(1)] = segs[i];
    else if (p !== segs[i]) return null;
  }
  return params;
}

function uuidParam(params: Params, key: string, what: string) {
  const v = params[key];
  if (!isUuid(v)) throw new ApiError("not_found", `${what} not found`, 404);
  return v;
}

async function envelopeJson(id: string, status = 200) {
  return json(serializeBundle(await E.getBundle(id)), status);
}

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

route("GET", "me", async ({ actor }) => {
  const [ws] = await sql<{ id: string; name: string; slug: string }[]>`select id, name, slug from sign.workspaces where id = ${actor.user.workspaceId}`;
  const u = actor.user;
  return json({
    object: "me",
    user: { id: u.id, name: u.name, email: u.email, role: u.role, title: u.title, company: u.company, timezone: u.timezone },
    workspace: ws ?? { id: u.workspaceId },
    apiKey: { id: actor.apiKey.id, name: actor.apiKey.name, prefix: actor.apiKey.prefix, scopes: actor.apiKey.scopes },
  });
});

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

route("GET", "templates", async ({ actor, url }) => {
  requireScope(actor, "templates:read");
  const scope = url.searchParams.get("scope");
  const rows = await T.listTemplates(actor.user, { q: url.searchParams.get("q") ?? undefined, scope: scope === "mine" || scope === "shared" ? scope : "all" });
  return json({ object: "list", data: rows.map(serializeTemplateRow), total: rows.length });
});

route("GET", "templates/:id", async ({ actor, params }) => {
  requireScope(actor, "templates:read");
  const t = await T.getTemplate(actor.user, uuidParam(params, "id", "Template"));
  return json(serializeTemplateDetail(t, await E.getBundle(t.envelopeId)));
});

// ---------------------------------------------------------------------------
// Envelopes
// ---------------------------------------------------------------------------

route("POST", "envelopes", async ({ req, actor }) => {
  requireScope(actor, "envelopes:write");
  const body = createEnvelopeBody.parse(await readJson(req));
  const id = await createEnvelope(actor, body);
  return envelopeJson(id, 201);
});

route("GET", "envelopes", async ({ actor, url }) => {
  requireScope(actor, "envelopes:read");
  const sp = url.searchParams;
  const status = sp.get("status") ?? sp.get("folder");
  const folder = isUuid(status) ? status : statusToFolder(status);
  if (folder === "__invalid__") throw new ApiError("invalid_request", `status must be one of ${STATUS_FILTERS.join(", ")} or a folder id`, 400);
  const limit = Math.max(1, Math.min(100, Number(sp.get("limit")) || 20));
  const offset = sp.has("offset") ? Math.max(0, Number(sp.get("offset")) || 0) : decodeCursor(sp.get("cursor"));
  const { rows, total } = await listForApi(actor.user, folder, { q: sp.get("q") ?? undefined, limit, offset, mine: sp.get("scope") === "mine" });
  const hasMore = offset + rows.length < total;
  return json({ object: "list", data: rows.map(serializeListRow), total, hasMore, nextCursor: hasMore ? encodeCursor(offset + rows.length) : null });
});

route("GET", "envelopes/:id", async ({ actor, params }) => {
  requireScope(actor, "envelopes:read");
  const id = uuidParam(params, "id", "Envelope");
  await assertView(actor.user, id);
  return envelopeJson(id);
});

route("PATCH", "envelopes/:id", async ({ req, actor, params }) => {
  requireScope(actor, "envelopes:write");
  const id = uuidParam(params, "id", "Envelope");
  const body = patchEnvelopeBody.parse(await readJson(req));
  await patchEnvelope(actor, id, body);
  return envelopeJson(id);
});

route("DELETE", "envelopes/:id", async ({ actor, params }) => {
  requireScope(actor, "envelopes:write");
  const id = uuidParam(params, "id", "Envelope");
  const result = await E.deleteEnvelope(actor.user, id);
  return json({ object: "envelope", id, deleted: true, mode: result });
});

route("POST", "envelopes/:id/send", async ({ actor, params }) => {
  requireScope(actor, "envelopes:write");
  const id = uuidParam(params, "id", "Envelope");
  await E.sendEnvelope(actor, id);
  return envelopeJson(id);
});

route("POST", "envelopes/:id/void", async ({ req, actor, params }) => {
  requireScope(actor, "envelopes:write");
  const id = uuidParam(params, "id", "Envelope");
  const { reason } = voidBody.parse(await readJson(req));
  await E.voidEnvelope(actor, id, reason);
  return envelopeJson(id);
});

route("POST", "envelopes/:id/resend", async ({ req, actor, params }) => {
  requireScope(actor, "envelopes:write");
  const id = uuidParam(params, "id", "Envelope");
  const { recipientId } = resendBody.parse(await readJson(req));
  const count = await E.resendEnvelope(actor, id, recipientId ?? null);
  return json({ object: "resend", envelopeId: id, resentTo: count });
});

route("POST", "envelopes/:id/recipients/:rid/signing-link", async ({ actor, params }) => {
  requireScope(actor, "envelopes:write");
  const id = uuidParam(params, "id", "Envelope");
  const rid = uuidParam(params, "rid", "Recipient");
  const env = await assertEdit(actor.user, id);
  if (env.status !== "sent") throw new ApiError("not_in_progress", `Signing links are only available while the envelope is in progress (it is ${env.status})`, 409);
  const [r] = await sql<Recipient[]>`select * from sign.recipients where id = ${rid} and envelope_id = ${id}`;
  if (!r) throw new ApiError("not_found", "Recipient not found on this envelope", 404);
  if (r.role === "cc") throw new ApiError("invalid_recipient", "Carbon copy recipients don't sign", 409);
  if (r.status !== "sent" && r.status !== "delivered") {
    const why = r.status === "created" ? "it isn't their turn in the signing order yet" : `their status is ${r.status}`;
    throw new ApiError("recipient_not_active", `Can't issue a signing link for ${r.name}: ${why}`, 409);
  }
  const token = await issueSigningToken(r.id, env.expiresAt);
  await appendEvent(sql, { envelopeId: id, recipientId: r.id, type: "recipient.link_issued", description: `Signing link for ${r.name} issued via API by ${actor.user.name || actor.user.email}`, actorUserId: actor.user.id, actorApiKeyId: actor.apiKeyId, meta: actor.meta });
  return json({ object: "signing_link", envelopeId: id, recipientId: r.id, url: signingUrl(token), expiresAt: env.expiresAt ? new Date(env.expiresAt).toISOString() : null, requiresAccessCode: !!r.accessCodeHash });
});

async function downloadEnvelopeFile(actor: ApiActor, id: string, which: "completed" | "certificate", download: boolean) {
  const env = await assertView(actor.user, id);
  if (env.status !== "completed") throw new ApiError("not_completed", `The envelope is ${env.status}. The ${which === "completed" ? "completed PDF" : "certificate"} exists once every recipient has finished.`, 409);
  const fileId = which === "completed" ? env.completedFileId : env.certificateFileId;
  if (!fileId) throw new ApiError("not_ready", "The envelope just completed and the sealed PDF is still being generated. Retry in a few seconds.", 409, undefined, { "Retry-After": "5" });
  const { file, bytes } = await readFileBytes(fileId);
  await appendEvent(sql, { envelopeId: id, type: "document.downloaded", description: `${actor.user.name || actor.user.email} downloaded ${file.filename} via API`, actorUserId: actor.user.id, actorApiKeyId: actor.apiKeyId, meta: actor.meta });
  return pdfResponse(bytes, file.filename, download);
}

route("GET", "envelopes/:id/documents/combined", async ({ actor, params, url }) => {
  requireScope(actor, "envelopes:read");
  return downloadEnvelopeFile(actor, uuidParam(params, "id", "Envelope"), "completed", url.searchParams.get("download") !== "0");
});

route("GET", "envelopes/:id/certificate", async ({ actor, params, url }) => {
  requireScope(actor, "envelopes:read");
  return downloadEnvelopeFile(actor, uuidParam(params, "id", "Envelope"), "certificate", url.searchParams.get("download") !== "0");
});

route("GET", "envelopes/:id/documents/:docId", async ({ actor, params, url }) => {
  requireScope(actor, "envelopes:read");
  const id = uuidParam(params, "id", "Envelope");
  const docId = uuidParam(params, "docId", "Document");
  await assertView(actor.user, id);
  const [doc] = await sql<EnvelopeDocument[]>`select * from sign.documents where id = ${docId} and envelope_id = ${id}`;
  if (!doc) throw new ApiError("not_found", "Document not found on this envelope", 404);
  const { bytes } = await readFileBytes(doc.fileId);
  return pdfResponse(bytes, `${doc.name}.pdf`, url.searchParams.get("download") === "1");
});

route("GET", "envelopes/:id/events", async ({ actor, params }) => {
  requireScope(actor, "envelopes:read");
  const id = uuidParam(params, "id", "Envelope");
  await assertView(actor.user, id);
  const events = await E.getEvents(id);
  return json({ object: "list", data: events.map(serializeEvent), total: events.length });
});

route("GET", "envelopes/:id/comments", async ({ actor, params }) => {
  requireScope(actor, "envelopes:read");
  const id = uuidParam(params, "id", "Envelope");
  await assertView(actor.user, id);
  const comments = await E.getComments(id, true);
  return json({ object: "list", data: comments.map(serializeComment), total: comments.length });
});

route("POST", "envelopes/:id/comments", async ({ req, actor, params }) => {
  requireScope(actor, "envelopes:write");
  const id = uuidParam(params, "id", "Envelope");
  const { body, visibility } = commentBody.parse(await readJson(req));
  const c = await E.addComment(actor, id, body, visibility);
  return json(serializeComment({ ...c, authorName: actor.user.name, authorEmail: actor.user.email }), 201);
});

// ---------------------------------------------------------------------------
// Webhooks (workspace-wide, so owners/admins only)
// ---------------------------------------------------------------------------

route("GET", "webhooks", async ({ actor }) => {
  requireAdminActor(actor);
  const hooks = await U.listWebhooks(actor.user);
  return json({
    object: "list",
    data: hooks.map((h) => ({ object: "webhook", id: h.id, url: h.url, events: h.events, active: h.active, description: h.description, createdAt: new Date(h.createdAt).toISOString(), secretPreview: `${h.secret.slice(0, 10)}...` })),
    total: hooks.length,
  });
});

route("POST", "webhooks", async ({ req, actor }) => {
  requireAdminActor(actor);
  const body = webhookBody.parse(await readJson(req));
  const allowed = new Set<string>(["*", ...WEBHOOK_EVENTS]);
  const bad = body.events.filter((e) => !allowed.has(e));
  if (bad.length) throw new ApiError("invalid_request", `Unknown webhook event(s): ${bad.join(", ")}. Valid: ${[...allowed].join(", ")}`, 400);
  const { id, secret } = await U.createWebhook(actor.user, { url: body.url, events: body.events, description: body.description });
  return json({ object: "webhook", id, url: body.url, events: body.events, active: true, description: body.description ?? "", secret }, 201);
});

route("DELETE", "webhooks/:id", async ({ actor, params }) => {
  requireAdminActor(actor);
  const id = uuidParam(params, "id", "Webhook");
  const [hook] = await sql<{ id: string }[]>`select id from sign.webhooks where id = ${id} and workspace_id = ${actor.user.workspaceId}`;
  if (!hook) throw new ApiError("not_found", "Webhook not found", 404);
  await U.deleteWebhook(actor.user, id);
  return json({ object: "webhook", id, deleted: true });
});

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

const PUBLIC: Record<string, (url: URL) => Response> = {
  "openapi.json": () => json(buildOpenApi(apiBase()), 200, { "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" }),
  "": () => json({ object: "api", name: `${brand.name} REST API`, version: "v1", docs: `${apiBase().replace(/\/api\/v1$/, "")}/developers`, openapi: `${apiBase()}/openapi.json` }),
};

/** Single entry point for app/api/v1/[[...path]]/route.ts and for in-process callers (the MCP server). */
export async function handleApiRequest(req: Request, opts: { via?: "api" | "mcp" } = {}): Promise<Response> {
  try {
    const url = new URL(req.url);
    const segs = segments(url.pathname);
    const method = req.method.toUpperCase();
    const key = segs.join("/");
    if (method === "GET" && key in PUBLIC) return PUBLIC[key](url);

    const candidates = routes.map((r) => ({ r, params: match(r.pattern, segs) })).filter((x) => x.params);
    if (!candidates.length) throw new ApiError("not_found", `No endpoint ${method} /api/v1/${key}. See ${apiBase()}/openapi.json`, 404);
    // literal segments beat params ("documents/combined" over "documents/:docId")
    candidates.sort((a, b) => b.r.pattern.filter((p) => !p.startsWith(":")).length - a.r.pattern.filter((p) => !p.startsWith(":")).length);
    const hit = candidates.find((x) => x.r.method === method);
    if (!hit) {
      const allow = [...new Set(candidates.map((x) => x.r.method))].join(", ");
      throw new ApiError("method_not_allowed", `${method} isn't supported here. Allowed: ${allow}`, 405, undefined, { Allow: allow });
    }
    const actor = await authenticate(req, opts.via ?? "api");
    return await hit.r.handler({ req, url, actor, params: hit.params! });
  } catch (e) {
    return toErrorResponse(e);
  }
}

/** For tests and docs: every registered method + path. */
export function listRoutes() {
  return routes.map((r) => `${r.method} /${r.pattern.map((p) => (p.startsWith(":") ? `{${p.slice(1)}}` : p)).join("/")}`);
}
