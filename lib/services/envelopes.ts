import { brand } from "@/lib/brand";
import "server-only";
import { sql, type Db, type Tx } from "@/lib/db";
import { appendEvent } from "@/lib/audit";
import { getObject, storeFile, removeObject } from "@/lib/storage";
import { getPdfInfo, normalizePdf, PdfError, findAnchors } from "@/lib/pdf";
import { hashSecret } from "@/lib/crypto";
import type { RequestMeta } from "@/lib/request-meta";
import type { AppUser, Envelope, EnvelopeDocument, Recipient, Field, EnvelopeEvent, Comment, FieldType, RecipientRole, FieldOptions } from "@/lib/types";
import { AppError, assertEdit, assertView, loadEnvelope } from "@/lib/services/access";

export interface Actor {
  user?: AppUser | null;
  apiKeyId?: string | null;
  meta?: RequestMeta | null;
  via?: "web" | "api" | "mcp" | "system";
}

export interface EnvelopeBundle {
  envelope: Envelope;
  owner: { id: string; name: string; email: string } | null;
  documents: EnvelopeDocument[];
  recipients: Recipient[];
  fields: Field[];
}

const ACTION_ROLES: RecipientRole[] = ["signer", "approver", "viewer"];
export const FIELD_TYPES: FieldType[] = ["signature", "initials", "stamp", "date_signed", "name", "first_name", "last_name", "email", "company", "title", "text", "number", "date", "checkbox", "radio", "dropdown", "note", "drawing", "formula", "attachment", "approve", "decline"];

function actorName(a: Actor) {
  return a.user?.name || a.user?.email || (a.apiKeyId ? "API" : "System");
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getBundle(id: string, db: Db = sql): Promise<EnvelopeBundle> {
  const [envelope] = await db<Envelope[]>`select * from sign.envelopes where id = ${id}`;
  if (!envelope) throw new AppError("not_found", "Envelope not found", 404);
  const [owner] = await db<{ id: string; name: string; email: string }[]>`select id, name, email from sign.users where id = ${envelope.ownerId}`;
  const documents = await db<EnvelopeDocument[]>`select * from sign.documents where envelope_id = ${id} order by position, created_at`;
  const recipients = await db<Recipient[]>`select * from sign.recipients where envelope_id = ${id} order by routing_order, position, created_at`;
  const fields = await db<Field[]>`select * from sign.fields where envelope_id = ${id} order by created_at`;
  return { envelope, owner: owner ?? null, documents, recipients, fields };
}

export async function getEvents(id: string): Promise<EnvelopeEvent[]> {
  return sql<EnvelopeEvent[]>`select * from sign.events where envelope_id = ${id} order by id`;
}

export async function getComments(id: string, includeInternal: boolean): Promise<(Comment & { authorName: string; authorEmail: string })[]> {
  return sql<(Comment & { authorName: string; authorEmail: string })[]>`
    select c.*, coalesce(u.name, r.name, '') as author_name, coalesce(u.email, r.email, '') as author_email
    from sign.comments c
    left join sign.users u on u.id = c.author_user_id
    left join sign.recipients r on r.id = c.author_recipient_id
    where c.envelope_id = ${id} and c.deleted_at is null ${includeInternal ? sql`` : sql`and c.visibility = 'everyone'`}
    order by c.created_at`;
}

export type FolderKey = "inbox" | "sent" | "drafts" | "deleted" | "action_required" | "waiting" | "expiring" | "completed" | "all" | "voided" | "declined";

export interface EnvelopeListRow {
  id: string;
  subject: string;
  status: Envelope["status"];
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  sentAt: Date | null;
  completedAt: Date | null;
  expiresAt: Date | null;
  lastActivityAt: Date;
  createdAt: Date;
  deletedAt: Date | null;
  recipients: { id: string; name: string; email: string; role: RecipientRole; status: Recipient["status"]; routingOrder: number }[];
  myAction: boolean;
}

export async function listEnvelopes(user: AppUser, opts: { folder?: FolderKey | string; q?: string; scope?: "mine" | "team"; limit?: number; offset?: number } = {}): Promise<{ rows: EnvelopeListRow[]; total: number }> {
  const folder = opts.folder || "all";
  const limit = Math.min(opts.limit ?? 50, 200);
  const offset = opts.offset ?? 0;
  const q = opts.q?.trim() ? `%${opts.q.trim().toLowerCase()}%` : null;
  const mine = opts.scope === "mine";
  const isUuid = /^[0-9a-f-]{36}$/i.test(folder);

  const visibility = sql`(e.visibility = 'workspace' or e.owner_id = ${user.id} or exists (select 1 from sign.envelope_collaborators c where c.envelope_id = e.id and c.user_id = ${user.id}))`;
  const actionForMe = sql`exists (select 1 from sign.recipients r where r.envelope_id = e.id and lower(r.email) = lower(${user.email}) and r.status in ('sent','delivered') and r.role <> 'cc')`;
  const notDeleted = sql`e.deleted_at is null`;
  let where = sql`e.workspace_id = ${user.workspaceId} and e.status <> 'template' and ${visibility}`;
  switch (folder) {
    case "inbox": where = sql`${where} and ${notDeleted} and e.status <> 'draft' and exists (select 1 from sign.recipients r where r.envelope_id = e.id and lower(r.email) = lower(${user.email}) and r.status <> 'created')`; break;
    case "sent": where = sql`${where} and ${notDeleted} and e.status <> 'draft' and e.owner_id = ${user.id}`; break;
    case "drafts": where = sql`${where} and ${notDeleted} and e.status = 'draft'`; break;
    case "deleted": where = sql`${where} and e.deleted_at is not null`; break;
    case "action_required": where = sql`${where} and ${notDeleted} and e.status = 'sent' and ${actionForMe}`; break;
    case "waiting": where = sql`${where} and ${notDeleted} and e.status = 'sent' and not ${actionForMe}`; break;
    case "expiring": where = sql`${where} and ${notDeleted} and e.status = 'sent' and e.expires_at < now() + interval '5 days'`; break;
    case "completed": where = sql`${where} and ${notDeleted} and e.status = 'completed'`; break;
    case "voided": where = sql`${where} and ${notDeleted} and e.status = 'voided'`; break;
    case "declined": where = sql`${where} and ${notDeleted} and e.status = 'declined'`; break;
    default:
      if (isUuid) where = sql`${where} and ${notDeleted} and exists (select 1 from sign.envelope_folders f where f.envelope_id = e.id and f.folder_id = ${folder})`;
      else where = sql`${where} and ${notDeleted}`;
  }
  if (mine) where = sql`${where} and e.owner_id = ${user.id}`;
  if (q) where = sql`${where} and (lower(e.subject) like ${q} or exists (select 1 from sign.recipients r where r.envelope_id = e.id and (lower(r.name) like ${q} or lower(r.email) like ${q})) or lower(e.id::text) like ${q})`;

  const rows = await sql<EnvelopeListRow[]>`
    select e.id, e.subject, e.status, e.owner_id, u.name as owner_name, u.email as owner_email, e.sent_at, e.completed_at, e.expires_at,
           e.last_activity_at, e.created_at, e.deleted_at,
           coalesce((select json_agg(json_build_object('id', r.id, 'name', r.name, 'email', r.email, 'role', r.role, 'status', r.status, 'routingOrder', r.routing_order) order by r.routing_order, r.position)
                     from sign.recipients r where r.envelope_id = e.id and r.status <> 'replaced'), '[]') as recipients,
           ${actionForMe} as my_action
    from sign.envelopes e join sign.users u on u.id = e.owner_id
    where ${where}
    order by e.last_activity_at desc
    limit ${limit} offset ${offset}`;
  const [{ count }] = await sql<{ count: number }[]>`select count(*)::int as count from sign.envelopes e where ${where}`;
  return { rows, total: count };
}

export async function folderCounts(user: AppUser) {
  const [row] = await sql<{ actionRequired: number; waiting: number; expiring: number; completed: number; drafts: number }[]>`
    select
      count(*) filter (where e.status = 'sent' and exists (select 1 from sign.recipients r where r.envelope_id = e.id and lower(r.email) = lower(${user.email}) and r.status in ('sent','delivered') and r.role <> 'cc'))::int as action_required,
      count(*) filter (where e.status = 'sent' and not exists (select 1 from sign.recipients r where r.envelope_id = e.id and lower(r.email) = lower(${user.email}) and r.status in ('sent','delivered') and r.role <> 'cc'))::int as waiting,
      count(*) filter (where e.status = 'sent' and e.expires_at < now() + interval '5 days')::int as expiring,
      count(*) filter (where e.status = 'completed' and e.completed_at > now() - interval '6 months')::int as completed,
      count(*) filter (where e.status = 'draft')::int as drafts
    from sign.envelopes e
    where e.workspace_id = ${user.workspaceId} and e.deleted_at is null and e.status <> 'template'
      and (e.visibility = 'workspace' or e.owner_id = ${user.id} or exists (select 1 from sign.envelope_collaborators c where c.envelope_id = e.id and c.user_id = ${user.id}))`;
  return row;
}

// ---------------------------------------------------------------------------
// Drafts
// ---------------------------------------------------------------------------

export async function createDraft(user: AppUser, opts: { subject?: string; message?: string; createdVia?: Envelope["createdVia"]; apiKeyId?: string | null; templateId?: string | null; status?: "draft" | "template" } = {}, db: Db = sql): Promise<Envelope> {
  const [ws] = await db<{ settings: Record<string, number | boolean> }[]>`select settings from sign.workspaces where id = ${user.workspaceId}`;
  const s = (ws?.settings ?? {}) as Record<string, number | boolean | undefined>;
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  const [env] = await db<Envelope[]>`
    insert into sign.envelopes (workspace_id, owner_id, created_via, api_key_id, template_id, status, subject, message,
      reminder_delay_days, reminder_frequency_days, expire_after_days, expire_warn_days, reminder_enabled, allow_reassign, allow_comments, sender_name, sender_email)
    values (${user.workspaceId}, ${user.id}, ${opts.createdVia ?? "web"}, ${opts.apiKeyId ?? null}, ${opts.templateId ?? null}, ${opts.status ?? "draft"},
      ${opts.subject ?? ""}, ${opts.message ?? ""}, ${num(s.reminderDelayDays, 2)}, ${num(s.reminderFrequencyDays, 3)}, ${num(s.expireAfterDays, 120)}, ${num(s.expireWarnDays, 3)},
      ${bool(s.reminderEnabled, true)}, ${bool(s.allowReassignDefault, true)}, ${bool(s.allowCommentsDefault, true)},
      ${user.name || user.email}, ${user.email})
    returning *`;
  if (user.email.endsWith("@resend.dev")) {
    // QA test bot: keep its envelopes out of the team's lists
    await db`update sign.envelopes set visibility = 'private' where id = ${env.id}`;
    env.visibility = "private";
  }
  if (env.status === "draft") {
    await appendEvent(db, { envelopeId: env.id, type: "envelope.created", description: `Envelope created by ${user.name || user.email}`, actorUserId: user.id, actorApiKeyId: opts.apiKeyId ?? null });
  }
  return env;
}

export interface DraftPatch {
  subject?: string;
  message?: string;
  signingOrder?: boolean;
  reminderEnabled?: boolean;
  reminderDelayDays?: number;
  reminderFrequencyDays?: number;
  expireAfterDays?: number;
  expireWarnDays?: number;
  allowReassign?: boolean;
  allowComments?: boolean;
  visibility?: "workspace" | "private";
  metadata?: Record<string, unknown>;
}

function editable(env: Envelope) {
  if (env.status !== "draft" && env.status !== "template") throw new AppError("not_draft", "Only drafts can be edited. Use Correct for sent envelopes.", 409);
}

export async function updateDraft(user: AppUser, id: string, patch: DraftPatch) {
  const env = await assertEdit(user, id);
  editable(env);
  await updateEnvelopeSettings(id, patch);
}

export async function updateEnvelopeSettings(id: string, patch: DraftPatch, db: Db = sql) {
  const cols: Record<string, unknown> = {};
  if (patch.subject !== undefined) cols.subject = patch.subject.slice(0, 300);
  if (patch.message !== undefined) cols.message = patch.message.slice(0, 10000);
  if (patch.signingOrder !== undefined) cols.signingOrder = patch.signingOrder;
  if (patch.reminderEnabled !== undefined) cols.reminderEnabled = patch.reminderEnabled;
  if (patch.reminderDelayDays !== undefined) cols.reminderDelayDays = clampInt(patch.reminderDelayDays, 1, 60);
  if (patch.reminderFrequencyDays !== undefined) cols.reminderFrequencyDays = clampInt(patch.reminderFrequencyDays, 1, 60);
  if (patch.expireAfterDays !== undefined) cols.expireAfterDays = clampInt(patch.expireAfterDays, 1, 999);
  if (patch.expireWarnDays !== undefined) cols.expireWarnDays = clampInt(patch.expireWarnDays, 0, 60);
  if (patch.allowReassign !== undefined) cols.allowReassign = patch.allowReassign;
  if (patch.allowComments !== undefined) cols.allowComments = patch.allowComments;
  if (patch.visibility !== undefined) cols.visibility = patch.visibility;
  if (patch.metadata !== undefined) cols.metadata = sql.json(patch.metadata as never);
  if (!Object.keys(cols).length) return;
  cols.updatedAt = new Date();
  await db`update sign.envelopes set ${sql(cols)} where id = ${id}`;
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(Number(n) || min)));
}

/** Validates, normalizes and stores a PDF for an envelope. */
export async function addDocumentBytes(env: Envelope, input: { name: string; bytes: Uint8Array; createdBy?: string | null }, db: Db = sql): Promise<EnvelopeDocument> {
  let normalized: Uint8Array;
  try {
    normalized = await normalizePdf(input.bytes);
  } catch (e) {
    if (e instanceof PdfError) {
      const msg = e.code === "encrypted" ? "This PDF is password protected. Remove the password and upload it again." : e.code === "too_large" ? "This file is larger than 25 MB." : "This file isn't a valid PDF.";
      throw new AppError(`pdf_${e.code}`, msg);
    }
    throw e;
  }
  const info = await getPdfInfo(normalized);
  const docId = crypto.randomUUID();
  const name = input.name.replace(/(\.pdf)+$/i, "").replace(new RegExp(`^Complete with ${brand.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:?\\s*`, "i"), "").trim().slice(0, 200) || "Document";
  const file = await storeFile(db, {
    workspaceId: env.workspaceId,
    path: `envelopes/${env.id}/documents/${docId}.pdf`,
    filename: `${name}.pdf`,
    contentType: "application/pdf",
    bytes: normalized,
    kind: "document",
    createdBy: input.createdBy ?? null,
  });
  const [{ max }] = await db<{ max: number | null }[]>`select max(position) as max from sign.documents where envelope_id = ${env.id}`;
  const [doc] = await db<EnvelopeDocument[]>`
    insert into sign.documents (id, envelope_id, file_id, name, position, page_count, pages)
    values (${docId}, ${env.id}, ${file.id}, ${name}, ${(max ?? -1) + 1}, ${info.pageCount}, ${sql.json(info.pages.map((p) => ({ width: p.width, height: p.height, rotation: p.rotation })))})
    returning *`;
  if (!env.subject) {
    const subject = env.status === "template" ? name : `Complete with ${brand.name}: ${name}`;
    await db`update sign.envelopes set subject = ${subject} where id = ${env.id} and subject = ''`;
  }
  return doc;
}

export async function addDocumentFromUpload(user: AppUser, envelopeId: string, upload: { path: string; filename: string }) {
  const env = await assertEdit(user, envelopeId);
  editable(env);
  if (!upload.path.startsWith(`uploads/${user.workspaceId}/`)) throw new AppError("bad_upload", "Invalid upload");
  const bytes = await getObject(upload.path);
  const doc = await addDocumentBytes(env, { name: upload.filename, bytes, createdBy: user.id });
  await removeObject(upload.path).catch(() => {});
  return doc;
}

export async function renameDocument(user: AppUser, envelopeId: string, documentId: string, name: string) {
  const env = await assertEdit(user, envelopeId);
  editable(env);
  await sql`update sign.documents set name = ${name.slice(0, 200)} where id = ${documentId} and envelope_id = ${envelopeId}`;
}

export async function removeDocument(user: AppUser, envelopeId: string, documentId: string) {
  const env = await assertEdit(user, envelopeId);
  editable(env);
  await sql`delete from sign.documents where id = ${documentId} and envelope_id = ${envelopeId}`;
}

export async function reorderDocuments(user: AppUser, envelopeId: string, ids: string[]) {
  const env = await assertEdit(user, envelopeId);
  editable(env);
  await sql.begin(async (tx) => {
    for (let i = 0; i < ids.length; i++) await tx`update sign.documents set position = ${i} where id = ${ids[i]} and envelope_id = ${envelopeId}`;
  });
}

export interface RecipientInput {
  id?: string | null;
  name: string;
  email: string;
  role: RecipientRole;
  routingOrder?: number;
  templateRole?: string | null;
  privateMessage?: string | null;
  accessCode?: string | null; // plain; "" clears; undefined keeps
  colorIndex?: number;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function setRecipients(user: AppUser, envelopeId: string, input: RecipientInput[]) {
  const env = await assertEdit(user, envelopeId);
  editable(env);
  return writeRecipients(env, input);
}

export async function writeRecipients(env: Envelope, input: RecipientInput[], db: Db = sql): Promise<Recipient[]> {
  const isTemplate = env.status === "template";
  for (const r of input) {
    r.name = (r.name ?? "").trim();
    r.email = (r.email ?? "").trim().toLowerCase();
    if (!isTemplate) {
      if (!r.name) throw new AppError("recipient_name", "Every recipient needs a name");
      if (!EMAIL_RE.test(r.email)) throw new AppError("recipient_email", `"${r.email || r.name}" isn't a valid email`);
    } else if (!r.templateRole?.trim() && !r.name) {
      throw new AppError("role_name", "Every role needs a name");
    }
    if (!["signer", "cc", "viewer", "approver"].includes(r.role)) throw new AppError("recipient_role", "Invalid recipient role");
  }
  const existing = await db<Recipient[]>`select * from sign.recipients where envelope_id = ${env.id}`;
  const keep = new Set(input.map((r) => r.id).filter(Boolean) as string[]);
  const run = async (tx: Db) => {
    for (const r of existing) if (!keep.has(r.id)) await tx`delete from sign.recipients where id = ${r.id}`;
    const usedColors = new Set(existing.filter((r) => keep.has(r.id)).map((r) => r.colorIndex));
    let nextColor = 0;
    const pickColor = () => { while (usedColors.has(nextColor)) nextColor++; usedColors.add(nextColor); return nextColor; };
    for (let i = 0; i < input.length; i++) {
      const r = input[i];
      const routingOrder = env.signingOrder ? Math.max(1, Math.round(r.routingOrder ?? i + 1)) : 1;
      const accessCodeHash = r.accessCode === undefined ? undefined : r.accessCode ? hashSecret(r.accessCode.trim().toLowerCase()) : null;
      const prev = r.id ? existing.find((e) => e.id === r.id) : undefined;
      if (prev) {
        await tx`update sign.recipients set
          name = ${r.name}, email = ${r.email}, role = ${r.role}, routing_order = ${routingOrder}, position = ${i},
          template_role = ${r.templateRole ?? prev.templateRole}, private_message = ${r.privateMessage ?? null},
          access_code_hash = ${accessCodeHash === undefined ? prev.accessCodeHash : accessCodeHash}, updated_at = now()
          where id = ${prev.id}`;
      } else {
        await tx`insert into sign.recipients (envelope_id, name, email, role, routing_order, position, color_index, template_role, private_message, access_code_hash)
          values (${env.id}, ${r.name}, ${r.email}, ${r.role}, ${routingOrder}, ${i}, ${r.colorIndex ?? pickColor()}, ${r.templateRole ?? null}, ${r.privateMessage ?? null}, ${accessCodeHash ?? null})`;
      }
    }
    // CC / viewers can't own fields
    await tx`delete from sign.fields f using sign.recipients r where f.recipient_id = r.id and r.envelope_id = ${env.id} and r.role in ('cc','viewer')`;
    await upsertContacts(tx, env.workspaceId, input.filter((r) => EMAIL_RE.test(r.email)));
  };
  if ("begin" in db) await (db as typeof sql).begin(run);
  else await run(db);
  return db<Recipient[]>`select * from sign.recipients where envelope_id = ${env.id} order by routing_order, position`;
}

async function upsertContacts(db: Db, workspaceId: string, list: { name: string; email: string }[]) {
  for (const c of list) {
    if (!c.name) continue;
    await db`insert into sign.contacts (workspace_id, name, email, use_count, last_used_at) values (${workspaceId}, ${c.name}, ${c.email}, 1, now())
      on conflict (workspace_id, lower(email)) do update set name = excluded.name, use_count = sign.contacts.use_count + 1, last_used_at = now()`;
  }
}

export async function searchContacts(user: AppUser, q: string) {
  const like = `%${q.toLowerCase()}%`;
  return sql<{ name: string; email: string }[]>`
    select name, email from (
      select name, email, use_count as score from sign.contacts where workspace_id = ${user.workspaceId} and (lower(name) like ${like} or lower(email) like ${like})
      union all
      select name, email, 1000 as score from sign.users where workspace_id = ${user.workspaceId} and status <> 'disabled' and (lower(name) like ${like} or lower(email) like ${like})
    ) c order by score desc limit 8`;
}

export interface FieldInput {
  id?: string | null;
  documentId: string;
  recipientId: string;
  type: FieldType;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  required?: boolean;
  readOnly?: boolean;
  label?: string | null;
  options?: FieldOptions;
  value?: string | null;
}

export async function setFields(user: AppUser, envelopeId: string, input: FieldInput[]) {
  const env = await assertEdit(user, envelopeId);
  editable(env);
  return writeFields(env, input);
}

export async function writeFields(env: Envelope, input: FieldInput[], db: Db = sql) {
  const docs = await db<EnvelopeDocument[]>`select * from sign.documents where envelope_id = ${env.id}`;
  const recs = await db<Recipient[]>`select * from sign.recipients where envelope_id = ${env.id}`;
  const docMap = new Map(docs.map((d) => [d.id, d]));
  const recMap = new Map(recs.map((r) => [r.id, r]));
  const clean = input.map((f) => {
    const doc = docMap.get(f.documentId);
    const rec = recMap.get(f.recipientId);
    if (!doc) throw new AppError("field_document", "Field points at a missing document");
    if (!rec) throw new AppError("field_recipient", "Field points at a missing recipient");
    if (rec.role === "cc" || rec.role === "viewer") throw new AppError("field_recipient_role", `${rec.name || rec.templateRole} only receives a copy and can't have fields`);
    if (!FIELD_TYPES.includes(f.type)) throw new AppError("field_type", `Unknown field type ${f.type}`);
    const page = Math.max(0, Math.min(doc.pageCount - 1, Math.round(f.page)));
    const w = clamp01(f.width), h = clamp01(f.height);
    return {
      documentId: doc.id, recipientId: rec.id, type: f.type, page,
      x: clamp01(Math.min(f.x, 1 - w)), y: clamp01(Math.min(f.y, 1 - h)), width: w, height: h,
      required: ["checkbox", "note", "formula", "approve", "decline"].includes(f.type) ? !!f.required && f.type === "checkbox" : f.required !== false,
      readOnly: !!f.readOnly, label: f.label?.slice(0, 100) ?? null, options: f.options ?? {}, value: f.value ?? null,
    };
  });
  const run = async (tx: Db) => {
    await tx`delete from sign.fields where envelope_id = ${env.id}`;
    for (const f of clean) {
      await tx`insert into sign.fields (envelope_id, document_id, recipient_id, type, page, x, y, width, height, required, read_only, label, options, value)
        values (${env.id}, ${f.documentId}, ${f.recipientId}, ${f.type}, ${f.page}, ${f.x}, ${f.y}, ${f.width}, ${f.height}, ${f.required}, ${f.readOnly}, ${f.label}, ${sql.json(f.options as never)}, ${f.value})`;
    }
  };
  if ("begin" in db) await (db as typeof sql).begin(run);
  else await run(db);
}

function clamp01(n: number) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
}

/** Places fields relative to anchor text found in the documents (API helper). Offsets/sizes are in PDF points. */
export async function resolveAnchorFields(env: Envelope, specs: { anchor: string; recipientId: string; type: FieldType; offsetX?: number; offsetY?: number; width?: number; height?: number; required?: boolean; label?: string | null; options?: FieldOptions }[]): Promise<FieldInput[]> {
  if (!specs.length) return [];
  const docs = await sql<EnvelopeDocument[]>`select * from sign.documents where envelope_id = ${env.id} order by position`;
  const out: FieldInput[] = [];
  for (const doc of docs) {
    const { getObject: get } = await import("@/lib/storage");
    const [file] = await sql<{ path: string }[]>`select path from sign.files where id = ${doc.fileId}`;
    const bytes = await get(file.path);
    const hits = await findAnchors(bytes, [...new Set(specs.map((s) => s.anchor))]);
    for (const s of specs) {
      for (const hit of hits.filter((h) => h.anchor === s.anchor)) {
        const page = doc.pages[hit.page];
        const pw = page.width, ph = page.height;
        const def = defaultFieldSize(s.type);
        const width = (s.width ?? def.w) / pw, height = (s.height ?? def.h) / ph;
        out.push({ documentId: doc.id, recipientId: s.recipientId, type: s.type, page: hit.page,
          x: hit.x + (s.offsetX ?? 0) / pw, y: hit.y + (s.offsetY ?? 0) / ph, width, height,
          required: s.required, label: s.label, options: s.options });
      }
    }
  }
  return out;
}

export function defaultFieldSize(type: FieldType): { w: number; h: number } {
  switch (type) {
    case "signature": return { w: 160, h: 50 };
    case "initials": return { w: 56, h: 46 };
    case "checkbox": case "radio": return { w: 14, h: 14 };
    case "date_signed": case "date": return { w: 100, h: 18 };
    case "note": return { w: 160, h: 40 };
    case "stamp": return { w: 110, h: 110 };
    case "drawing": return { w: 200, h: 100 };
    case "attachment": return { w: 24, h: 24 };
    case "approve": case "decline": return { w: 80, h: 24 };
    case "formula": return { w: 100, h: 18 };
    default: return { w: 160, h: 18 };
  }
}

// ---------------------------------------------------------------------------
// Validation + send
// ---------------------------------------------------------------------------

export function validateForSend(b: EnvelopeBundle): string[] {
  const problems: string[] = [];
  if (!b.documents.length) problems.push("Add at least one document.");
  const active = b.recipients.filter((r) => r.status !== "replaced");
  if (!active.some((r) => ACTION_ROLES.includes(r.role))) problems.push("Add at least one recipient who needs to sign, approve or view.");
  for (const r of active) {
    if (!r.name || !EMAIL_RE.test(r.email)) problems.push(`${r.templateRole || r.name || "A recipient"} needs a name and a valid email.`);
    if (r.role === "signer" && !b.fields.some((f) => f.recipientId === r.id && (f.type === "signature" || f.type === "initials"))) {
      problems.push(`Add a signature field for ${r.name || r.email}.`);
    }
  }
  if (!b.envelope.subject.trim()) problems.push("Add an email subject.");
  return problems;
}

export async function sendEnvelope(actor: Actor & { user: AppUser }, id: string) {
  const env = await assertEdit(actor.user, id);
  if (env.status !== "draft") throw new AppError("not_draft", "This envelope was already sent", 409);
  const bundle = await getBundle(id);
  const problems = validateForSend(bundle);
  if (problems.length) throw new AppError("invalid_envelope", problems.join(" "));
  const { activateRouting } = await import("@/lib/services/routing");
  await sql.begin(async (tx) => {
    await tx`select id from sign.envelopes where id = ${id} for update`;
    await tx`update sign.envelopes set status = 'sent', sent_at = now(), expires_at = now() + make_interval(days => expire_after_days),
      sender_name = ${actor.user.name || actor.user.email}, sender_email = ${actor.user.email}, updated_at = now() where id = ${id}`;
    await appendEvent(tx, { envelopeId: id, type: "envelope.sent", description: `Envelope sent by ${actorName(actor)}`, actorUserId: actor.user.id, actorApiKeyId: actor.apiKeyId ?? null, meta: actor.meta });
  });
  await activateRouting(id, actor.meta ?? null);
  const { emitWebhook } = await import("@/lib/services/webhooks");
  await emitWebhook(env.workspaceId, "envelope.sent", id, { subject: bundle.envelope.subject });
  return loadEnvelope(id);
}

// ---------------------------------------------------------------------------
// Manage actions
// ---------------------------------------------------------------------------

export async function voidEnvelope(actor: Actor & { user: AppUser }, id: string, reason: string) {
  const env = await assertEdit(actor.user, id);
  if (env.status !== "sent") throw new AppError("not_in_progress", "Only in-progress envelopes can be voided", 409);
  if (!reason.trim()) throw new AppError("reason_required", "Add a reason for voiding");
  await sql.begin(async (tx) => {
    await tx`select id from sign.envelopes where id = ${id} for update`;
    await tx`update sign.envelopes set status = 'voided', voided_at = now(), void_reason = ${reason.slice(0, 500)}, updated_at = now() where id = ${id}`;
    await tx`update sign.signing_tokens set revoked_at = now() where revoked_at is null and recipient_id in (select id from sign.recipients where envelope_id = ${id})`;
    await appendEvent(tx, { envelopeId: id, type: "envelope.voided", description: `Envelope voided by ${actorName(actor)}: ${reason}`, actorUserId: actor.user.id, actorApiKeyId: actor.apiKeyId ?? null, meta: actor.meta, data: { reason } });
  });
  const { notifyVoided } = await import("@/lib/services/notify");
  await notifyVoided(id, reason);
  const { emitWebhook } = await import("@/lib/services/webhooks");
  await emitWebhook(env.workspaceId, "envelope.voided", id, { reason });
}

export async function resendEnvelope(actor: Actor & { user: AppUser }, id: string, recipientId?: string | null) {
  const env = await assertEdit(actor.user, id);
  if (env.status !== "sent") throw new AppError("not_in_progress", "Only in-progress envelopes can be resent", 409);
  const { sendSigningRequest } = await import("@/lib/services/notify");
  const active = await sql<Recipient[]>`select * from sign.recipients where envelope_id = ${id} and status in ('sent','delivered') and role <> 'cc' ${recipientId ? sql`and id = ${recipientId}` : sql``}`;
  for (const r of active) await sendSigningRequest(id, r.id, { reminder: false });
  await appendEvent(sql, { envelopeId: id, type: "envelope.resent", description: `Envelope resent to ${active.map((r) => r.name).join(", ") || "nobody"} by ${actorName(actor)}`, actorUserId: actor.user.id, meta: actor.meta });
  return active.length;
}

export async function deleteEnvelope(user: AppUser, id: string) {
  const env = await assertEdit(user, id);
  if (env.status === "draft") {
    await sql`delete from sign.envelopes where id = ${id}`;
    return "purged";
  }
  if (env.status === "sent") throw new AppError("in_progress", "Void this envelope before deleting it", 409);
  await sql`update sign.envelopes set deleted_at = now() where id = ${id}`;
  return "deleted";
}

export async function restoreEnvelope(user: AppUser, id: string) {
  await assertEdit(user, id);
  await sql`update sign.envelopes set deleted_at = null where id = ${id}`;
}

/** Copies documents, recipients and fields into a new draft (also used for templates). */
export async function copyEnvelope(user: AppUser, sourceId: string, opts: { status?: "draft" | "template"; subject?: string; createdVia?: Envelope["createdVia"]; templateId?: string | null; apiKeyId?: string | null; keepRecipients?: boolean } = {}): Promise<Envelope> {
  const src = await getBundle(sourceId);
  return sql.begin(async (tx) => {
    const env = await createDraft(user, {
      subject: opts.subject ?? src.envelope.subject,
      message: src.envelope.message,
      status: opts.status ?? "draft",
      createdVia: opts.createdVia ?? "web",
      templateId: opts.templateId ?? null,
      apiKeyId: opts.apiKeyId ?? null,
    }, tx);
    await tx`update sign.envelopes set signing_order = ${src.envelope.signingOrder}, reminder_enabled = ${src.envelope.reminderEnabled},
      reminder_delay_days = ${src.envelope.reminderDelayDays}, reminder_frequency_days = ${src.envelope.reminderFrequencyDays},
      expire_after_days = ${src.envelope.expireAfterDays}, allow_reassign = ${src.envelope.allowReassign}, allow_comments = ${src.envelope.allowComments},
      metadata = ${sql.json(src.envelope.metadata as never)} where id = ${env.id}`;
    const docMap = new Map<string, string>();
    for (const d of src.documents) {
      const [nd] = await tx<{ id: string }[]>`insert into sign.documents (envelope_id, file_id, name, position, page_count, pages)
        values (${env.id}, ${d.fileId}, ${d.name}, ${d.position}, ${d.pageCount}, ${sql.json(d.pages as never)}) returning id`;
      docMap.set(d.id, nd.id);
    }
    const recMap = new Map<string, string>();
    for (const r of src.recipients.filter((r) => r.status !== "replaced")) {
      const keep = opts.keepRecipients !== false;
      const [nr] = await tx<{ id: string }[]>`insert into sign.recipients (envelope_id, name, email, role, routing_order, position, color_index, template_role, private_message, access_code_hash)
        values (${env.id}, ${keep ? r.name : ""}, ${keep ? r.email : ""}, ${r.role}, ${r.routingOrder}, ${r.position}, ${r.colorIndex}, ${r.templateRole}, ${r.privateMessage}, ${keep ? r.accessCodeHash : null}) returning id`;
      recMap.set(r.id, nr.id);
    }
    for (const f of src.fields) {
      const docId = docMap.get(f.documentId), recId = recMap.get(f.recipientId);
      if (!docId || !recId) continue;
      const value = ["text", "number", "date", "dropdown", "checkbox", "radio", "note", "company", "title"].includes(f.type) && f.readOnly ? f.value : (src.envelope.status === "template" ? f.value : null);
      await tx`insert into sign.fields (envelope_id, document_id, recipient_id, type, page, x, y, width, height, required, read_only, label, options, value)
        values (${env.id}, ${docId}, ${recId}, ${f.type}, ${f.page}, ${f.x}, ${f.y}, ${f.width}, ${f.height}, ${f.required}, ${f.readOnly}, ${f.label}, ${sql.json(f.options as never)}, ${value})`;
    }
    return env;
  });
}

export async function cloneEnvelope(user: AppUser, id: string) {
  await assertView(user, id);
  return copyEnvelope(user, id, { status: "draft" });
}

// ---------------------------------------------------------------------------
// Correct (sent envelopes): edit pending recipients + settings, re-send to changed ones
// ---------------------------------------------------------------------------

export async function correctEnvelope(actor: Actor & { user: AppUser }, id: string, input: { subject?: string; message?: string; expireAfterDays?: number; reminderEnabled?: boolean; recipients: { id: string; name: string; email: string }[] }) {
  const env = await assertEdit(actor.user, id);
  if (env.status !== "sent") throw new AppError("not_in_progress", "Only in-progress envelopes can be corrected", 409);
  const recs = await sql<Recipient[]>`select * from sign.recipients where envelope_id = ${id}`;
  const changed: string[] = [];
  await sql.begin(async (tx) => {
    await tx`select id from sign.envelopes where id = ${id} for update`;
    if (input.subject !== undefined || input.message !== undefined || input.reminderEnabled !== undefined) {
      await updateEnvelopeSettings(id, { subject: input.subject, message: input.message, reminderEnabled: input.reminderEnabled }, tx);
    }
    if (input.expireAfterDays) await tx`update sign.envelopes set expire_after_days = ${clampInt(input.expireAfterDays, 1, 999)}, expires_at = sent_at + make_interval(days => ${clampInt(input.expireAfterDays, 1, 999)}) where id = ${id}`;
    for (const r of input.recipients) {
      const prev = recs.find((x) => x.id === r.id);
      if (!prev || prev.status === "completed" || prev.status === "declined" || prev.status === "replaced") continue;
      const email = r.email.trim().toLowerCase();
      if (!EMAIL_RE.test(email) || !r.name.trim()) throw new AppError("recipient_email", `Check the name and email for ${r.name || r.email}`);
      if (email !== prev.email || r.name.trim() !== prev.name) {
        await tx`update sign.recipients set name = ${r.name.trim()}, email = ${email}, updated_at = now() where id = ${prev.id}`;
        if (email !== prev.email) await tx`update sign.signing_tokens set revoked_at = now() where recipient_id = ${prev.id} and revoked_at is null`;
        changed.push(prev.id);
      }
    }
    await appendEvent(tx, { envelopeId: id, type: "envelope.corrected", description: `Envelope corrected by ${actorName(actor)}`, actorUserId: actor.user.id, meta: actor.meta, data: { changedRecipients: changed } });
  });
  const { sendSigningRequest } = await import("@/lib/services/notify");
  const active = await sql<Recipient[]>`select * from sign.recipients where envelope_id = ${id} and status in ('sent','delivered') and role <> 'cc'`;
  for (const r of active.filter((r) => changed.includes(r.id))) await sendSigningRequest(id, r.id, { correction: true });
  const { emitWebhook } = await import("@/lib/services/webhooks");
  await emitWebhook(env.workspaceId, "envelope.corrected", id, { changedRecipients: changed });
  return changed.length;
}

// ---------------------------------------------------------------------------
// Collaboration
// ---------------------------------------------------------------------------

export async function addComment(actor: Actor & { user: AppUser }, id: string, body: string, visibility: "internal" | "everyone" = "internal") {
  const env = await assertView(actor.user, id);
  const text = body.trim().slice(0, 4000);
  if (!text) throw new AppError("empty", "Write a comment first");
  const [c] = await sql<Comment[]>`insert into sign.comments (envelope_id, author_user_id, body, visibility) values (${id}, ${actor.user.id}, ${text}, ${visibility}) returning *`;
  await appendEvent(sql, { envelopeId: id, type: "comment.added", description: `${actorName(actor)} added a ${visibility === "internal" ? "team note" : "comment"}`, actorUserId: actor.user.id, meta: actor.meta });
  const { notifyComment } = await import("@/lib/services/notify");
  await notifyComment(id, actor.user, text, visibility).catch(() => {});
  const { emitWebhook } = await import("@/lib/services/webhooks");
  await emitWebhook(env.workspaceId, "comment.added", id, { body: text, visibility, author: actor.user.email });
  return c;
}

export async function setCollaborators(user: AppUser, id: string, list: { userId: string; permission: "view" | "edit" | "manage" }[]) {
  await assertEdit(user, id);
  await sql.begin(async (tx) => {
    await tx`delete from sign.envelope_collaborators where envelope_id = ${id}`;
    for (const c of list) await tx`insert into sign.envelope_collaborators (envelope_id, user_id, permission, added_by) values (${id}, ${c.userId}, ${c.permission}, ${user.id}) on conflict do nothing`;
  });
}

export async function transferOwnership(user: AppUser, id: string, newOwnerId: string) {
  await assertEdit(user, id);
  const [u] = await sql<{ id: string; name: string }[]>`select id, name from sign.users where id = ${newOwnerId} and workspace_id = ${user.workspaceId}`;
  if (!u) throw new AppError("bad_user", "That user isn't in this workspace");
  await sql`update sign.envelopes set owner_id = ${u.id} where id = ${id}`;
  await appendEvent(sql, { envelopeId: id, type: "envelope.transferred", description: `Ownership transferred to ${u.name} by ${user.name}`, actorUserId: user.id });
}

export async function moveToFolder(user: AppUser, envelopeIds: string[], folderId: string | null) {
  for (const id of envelopeIds) {
    await assertView(user, id);
    await sql`delete from sign.envelope_folders where envelope_id = ${id}`;
    if (folderId) await sql`insert into sign.envelope_folders (envelope_id, folder_id) values (${id}, ${folderId}) on conflict do nothing`;
  }
}

export async function listFolders(user: AppUser) {
  return sql<{ id: string; name: string; shared: boolean; ownerId: string; count: number }[]>`
    select f.id, f.name, f.shared, f.owner_id, (select count(*)::int from sign.envelope_folders ef join sign.envelopes e on e.id = ef.envelope_id where ef.folder_id = f.id and e.deleted_at is null) as count
    from sign.folders f where f.workspace_id = ${user.workspaceId} and (f.shared or f.owner_id = ${user.id}) order by f.name`;
}

export async function createFolder(user: AppUser, name: string) {
  const n = name.trim().slice(0, 80);
  if (!n) throw new AppError("empty", "Name the folder");
  const [f] = await sql<{ id: string }[]>`insert into sign.folders (workspace_id, owner_id, name) values (${user.workspaceId}, ${user.id}, ${n}) returning id`;
  return f;
}

export type { Tx };

export async function assertEditPublic(user: AppUser, id: string) {
  return assertEdit(user, id);
}
