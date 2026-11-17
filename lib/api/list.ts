import "server-only";
import { sql } from "@/lib/db";
import * as E from "@/lib/services/envelopes";
import type { AppUser, EnvelopeStatus } from "@/lib/types";

/**
 * GET /envelopes. App folders go straight to E.listEnvelopes. The two plain status filters the
 * app has no folder for ("sent" = in progress, "expired") use the same visibility rule as the service.
 * TODO: if listEnvelopes grows `sent` / `expired` folders, delete listByStatus.
 */
export async function listForApi(user: AppUser, folder: string, opts: { q?: string; limit: number; offset: number; mine?: boolean }) {
  if (folder.startsWith("status:")) return listByStatus(user, folder.slice(7) as EnvelopeStatus, opts);
  return E.listEnvelopes(user, { folder, q: opts.q, limit: opts.limit, offset: opts.offset, scope: opts.mine ? "mine" : "team" });
}

async function listByStatus(user: AppUser, status: EnvelopeStatus, opts: { q?: string; limit: number; offset: number; mine?: boolean }) {
  const q = opts.q?.trim() ? `%${opts.q.trim().toLowerCase()}%` : null;
  const visibility = sql`(e.visibility = 'workspace' or e.owner_id = ${user.id} or exists (select 1 from sign.envelope_collaborators c where c.envelope_id = e.id and c.user_id = ${user.id}))`;
  let where = sql`e.workspace_id = ${user.workspaceId} and e.deleted_at is null and e.status = ${status} and ${visibility}`;
  if (opts.mine) where = sql`${where} and e.owner_id = ${user.id}`;
  if (q) where = sql`${where} and (lower(e.subject) like ${q} or exists (select 1 from sign.recipients r where r.envelope_id = e.id and (lower(r.name) like ${q} or lower(r.email) like ${q})) or lower(e.id::text) like ${q})`;
  const rows = await sql<E.EnvelopeListRow[]>`
    select e.id, e.subject, e.status, e.owner_id, u.name as owner_name, u.email as owner_email, e.sent_at, e.completed_at, e.expires_at,
           e.last_activity_at, e.created_at, e.deleted_at,
           coalesce((select json_agg(json_build_object('id', r.id, 'name', r.name, 'email', r.email, 'role', r.role, 'status', r.status, 'routingOrder', r.routing_order) order by r.routing_order, r.position)
                     from sign.recipients r where r.envelope_id = e.id and r.status <> 'replaced'), '[]') as recipients,
           exists (select 1 from sign.recipients r where r.envelope_id = e.id and lower(r.email) = lower(${user.email}) and r.status in ('sent','delivered') and r.role <> 'cc') as my_action
    from sign.envelopes e join sign.users u on u.id = e.owner_id
    where ${where}
    order by e.last_activity_at desc
    limit ${opts.limit} offset ${opts.offset}`;
  const [{ count }] = await sql<{ count: number }[]>`select count(*)::int as count from sign.envelopes e where ${where}`;
  return { rows, total: count };
}
