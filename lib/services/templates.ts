import "server-only";
import { sql } from "@/lib/db";
import type { AppUser, Envelope, Recipient, Template } from "@/lib/types";
import { AppError } from "@/lib/services/access";
import { copyEnvelope, createDraft, getBundle, writeRecipients, type FieldInput, writeFields } from "@/lib/services/envelopes";
import { appendEvent } from "@/lib/audit";

export interface TemplateRow extends Template { envelopeId: string; ownerName: string; documentCount: number; roleNames: string[] }

export async function listTemplates(user: AppUser, opts: { q?: string; scope?: "all" | "mine" | "shared" } = {}): Promise<TemplateRow[]> {
  const like = opts.q?.trim() ? `%${opts.q.trim().toLowerCase()}%` : null;
  return sql<TemplateRow[]>`
    select t.*, u.name as owner_name,
      (select count(*)::int from sign.documents d where d.envelope_id = t.envelope_id) as document_count,
      coalesce((select array_agg(coalesce(nullif(r.template_role, ''), r.name) order by r.routing_order, r.position) from sign.recipients r where r.envelope_id = t.envelope_id), '{}') as role_names
    from sign.templates t join sign.users u on u.id = t.owner_id
    where t.workspace_id = ${user.workspaceId} and t.deleted_at is null
      and (t.shared or t.owner_id = ${user.id})
      ${opts.scope === "mine" ? sql`and t.owner_id = ${user.id}` : opts.scope === "shared" ? sql`and t.shared and t.owner_id <> ${user.id}` : sql``}
      ${like ? sql`and (lower(t.name) like ${like} or lower(t.description) like ${like})` : sql``}
    order by coalesce(t.last_used_at, t.updated_at) desc`;
}

export async function getTemplate(user: AppUser, id: string): Promise<TemplateRow> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AppError("not_found", "Template not found", 404);
  const [t] = await sql<TemplateRow[]>`
    select t.*, u.name as owner_name, 0 as document_count, '{}'::text[] as role_names
    from sign.templates t join sign.users u on u.id = t.owner_id where t.id = ${id} and t.workspace_id = ${user.workspaceId} and t.deleted_at is null`;
  if (!t || (!t.shared && t.ownerId !== user.id)) throw new AppError("not_found", "Template not found", 404);
  return t;
}

export async function createTemplate(user: AppUser, input: { name: string; description?: string }) {
  const name = input.name.trim().slice(0, 200) || "Untitled template";
  return sql.begin(async (tx) => {
    const env = await createDraft(user, { subject: "", status: "template" }, tx);
    const [t] = await tx<Template[]>`insert into sign.templates (workspace_id, owner_id, name, description, envelope_id, shared) values (${user.workspaceId}, ${user.id}, ${name}, ${input.description ?? ""}, ${env.id}, ${!user.email.endsWith("@resend.dev")}) returning *`;
    return { template: t, envelopeId: env.id };
  });
}

export async function updateTemplate(user: AppUser, id: string, patch: { name?: string; description?: string; shared?: boolean }) {
  const t = await getTemplate(user, id);
  if (t.ownerId !== user.id && user.role !== "owner" && user.role !== "admin" && !t.shared) throw new AppError("forbidden", "You can't edit this template", 403);
  await sql`update sign.templates set
    name = ${patch.name?.trim().slice(0, 200) || t.name}, description = ${patch.description ?? t.description}, shared = ${patch.shared ?? t.shared}, updated_at = now()
    where id = ${id}`;
}

export async function deleteTemplate(user: AppUser, id: string) {
  const t = await getTemplate(user, id);
  if (t.ownerId !== user.id && user.role !== "owner" && user.role !== "admin") throw new AppError("forbidden", "Only the owner or an admin can delete this template", 403);
  await sql`update sign.templates set deleted_at = now() where id = ${id}`;
}

export async function saveEnvelopeAsTemplate(user: AppUser, envelopeId: string, name: string) {
  const src = await getBundle(envelopeId);
  if (src.envelope.workspaceId !== user.workspaceId) throw new AppError("not_found", "Envelope not found", 404);
  const env = await copyEnvelope(user, envelopeId, { status: "template", subject: src.envelope.subject });
  // roles keep the recipient's name as the role label but drop the person
  await sql`update sign.recipients set template_role = coalesce(nullif(template_role, ''), case role when 'signer' then 'Signer ' || (position + 1) else initcap(role) || ' ' || (position + 1) end), name = '', email = '', access_code_hash = null where envelope_id = ${env.id}`;
  const [t] = await sql<Template[]>`insert into sign.templates (workspace_id, owner_id, name, envelope_id) values (${user.workspaceId}, ${user.id}, ${name.trim().slice(0, 200) || src.envelope.subject || "Untitled template"}, ${env.id}) returning *`;
  return t;
}

export interface UseTemplateInput {
  roles: { role: string; name: string; email: string; accessCode?: string | null; privateMessage?: string | null }[];
  subject?: string;
  message?: string;
  prefill?: Record<string, string>; // field label -> value (read only fields stay read only)
  createdVia?: Envelope["createdVia"];
  apiKeyId?: string | null;
  metadata?: Record<string, unknown>;
}

/** Creates a draft from a template with the roles filled in. */
export async function createEnvelopeFromTemplate(user: AppUser, templateId: string, input: UseTemplateInput): Promise<Envelope> {
  const t = await getTemplate(user, templateId);
  const env = await copyEnvelope(user, t.envelopeId, { status: "draft", subject: input.subject ?? undefined, createdVia: input.createdVia ?? "template", templateId: t.id, apiKeyId: input.apiKeyId ?? null });
  if (input.message !== undefined) await sql`update sign.envelopes set message = ${input.message} where id = ${env.id}`;
  if (input.metadata) await sql`update sign.envelopes set metadata = ${sql.json(input.metadata as never)} where id = ${env.id}`;
  const roles = await sql<Recipient[]>`select * from sign.recipients where envelope_id = ${env.id} order by routing_order, position`;
  const filled = roles.map((r, i) => {
    const label = (r.templateRole || "").toLowerCase();
    const match = input.roles.find((x) => x.role.toLowerCase() === label) ?? (input.roles.length === roles.length ? input.roles[i] : undefined);
    return {
      id: r.id, role: r.role, routingOrder: r.routingOrder, templateRole: r.templateRole,
      name: match?.name ?? r.name, email: match?.email ?? r.email,
      privateMessage: match?.privateMessage ?? r.privateMessage, accessCode: match?.accessCode ?? undefined,
    };
  });
  const [fresh] = await sql<Envelope[]>`select * from sign.envelopes where id = ${env.id}`;
  const missing = filled.filter((r) => !r.name || !r.email).map((r) => r.templateRole || r.role);
  if (missing.length === 0) await writeRecipients({ ...fresh, status: "draft" }, filled);
  else {
    // keep partially filled roles so the sender can finish in the UI
    for (const r of filled) await sql`update sign.recipients set name = ${r.name}, email = ${(r.email || "").toLowerCase()} where id = ${r.id}`;
  }
  if (input.prefill && Object.keys(input.prefill).length) {
    const b = await getBundle(env.id);
    const fields: FieldInput[] = b.fields.map((f) => ({ ...f, value: f.label && input.prefill![f.label] !== undefined ? input.prefill![f.label] : f.value }));
    await writeFields(b.envelope, fields);
  }
  await sql`update sign.templates set use_count = use_count + 1, last_used_at = now() where id = ${t.id}`;
  await appendEvent(sql, { envelopeId: env.id, type: "envelope.from_template", description: `Created from template "${t.name}"`, actorUserId: user.id });
  return fresh;
}
