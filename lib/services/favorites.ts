import "server-only";
import { sql } from "@/lib/db";
import type { AppUser } from "@/lib/types";

export async function listFavoriteTemplateIds(user: AppUser): Promise<Set<string>> {
  const rows = await sql<{ templateId: string }[]>`select template_id from sign.template_favorites where user_id = ${user.id}`;
  return new Set(rows.map((r) => r.templateId));
}

export async function toggleFavoriteTemplate(user: AppUser, templateId: string): Promise<boolean> {
  const del = await sql`delete from sign.template_favorites where user_id = ${user.id} and template_id = ${templateId} returning template_id`;
  if (del.length) return false;
  await sql`insert into sign.template_favorites (user_id, template_id) values (${user.id}, ${templateId}) on conflict do nothing`;
  return true;
}

export async function listDeletedTemplates(user: AppUser) {
  return sql<{ id: string; name: string; ownerName: string; deletedAt: Date; envelopeId: string }[]>`
    select t.id, t.name, u.name as owner_name, t.deleted_at, t.envelope_id from sign.templates t join sign.users u on u.id = t.owner_id
    where t.workspace_id = ${user.workspaceId} and t.deleted_at is not null and (t.shared or t.owner_id = ${user.id}) order by t.deleted_at desc`;
}

export async function restoreTemplate(user: AppUser, id: string) {
  await sql`update sign.templates set deleted_at = null where id = ${id} and workspace_id = ${user.workspaceId}`;
}
