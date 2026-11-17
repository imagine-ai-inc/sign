import "server-only";
import { sql } from "@/lib/db";
import { newApiKey, randomToken } from "@/lib/crypto";
import type { AppUser, Role } from "@/lib/types";
import { AppError } from "@/lib/services/access";

export async function listUsers(user: AppUser) {
  return sql<AppUser[]>`select * from sign.users where workspace_id = ${user.workspaceId} order by status = 'disabled', name`;
}

export async function inviteUser(admin: AppUser, input: { email: string; name: string; role: Role }) {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError("bad_email", "Enter a valid email");
  if (input.role === "owner" && admin.role !== "owner") throw new AppError("forbidden", "Only the owner can add another owner", 403);
  await sql`insert into sign.users (workspace_id, email, name, role, status, company) values (${admin.workspaceId}, ${email}, ${input.name.trim()}, ${input.role}, 'invited', ${admin.company ?? null})
    on conflict (workspace_id, lower(email)) do update set role = excluded.role, status = case when sign.users.status = 'disabled' then 'invited' else sign.users.status end`;
}

export async function updateUserRole(admin: AppUser, userId: string, role: Role | "disabled") {
  const [target] = await sql<AppUser[]>`select * from sign.users where id = ${userId} and workspace_id = ${admin.workspaceId}`;
  if (!target) throw new AppError("not_found", "User not found", 404);
  if (target.role === "owner" && admin.role !== "owner") throw new AppError("forbidden", "Only the owner can change the owner", 403);
  if (target.id === admin.id) throw new AppError("self", "You can't change your own role");
  if (role === "disabled") await sql`update sign.users set status = 'disabled' where id = ${userId}`;
  else await sql`update sign.users set role = ${role}, status = case when status = 'disabled' then 'invited' else status end where id = ${userId}`;
}

export async function updateProfile(user: AppUser, input: { name?: string; title?: string | null; company?: string | null; timezone?: string; notificationPrefs?: Record<string, boolean> }) {
  await sql`update sign.users set
    name = ${input.name?.trim() || user.name}, title = ${input.title ?? user.title}, company = ${input.company ?? user.company},
    timezone = ${input.timezone || user.timezone}${input.notificationPrefs ? sql`, notification_prefs = ${sql.json(input.notificationPrefs)}` : sql``}
    where id = ${user.id}`;
}

export async function listApiKeys(user: AppUser) {
  return sql<{ id: string; name: string; prefix: string; userId: string; userName: string; scopes: string[]; lastUsedAt: Date | null; createdAt: Date; revokedAt: Date | null }[]>`
    select k.id, k.name, k.prefix, k.user_id, u.name as user_name, k.scopes, k.last_used_at, k.created_at, k.revoked_at
    from sign.api_keys k join sign.users u on u.id = k.user_id where k.workspace_id = ${user.workspaceId} order by k.revoked_at nulls first, k.created_at desc`;
}

export async function createApiKey(user: AppUser, name: string) {
  const { key, prefix, hash } = newApiKey();
  await sql`insert into sign.api_keys (workspace_id, user_id, name, prefix, key_hash) values (${user.workspaceId}, ${user.id}, ${name.trim().slice(0, 100) || "API key"}, ${prefix}, ${hash})`;
  return key; // shown once
}

export async function revokeApiKey(user: AppUser, id: string) {
  await sql`update sign.api_keys set revoked_at = now() where id = ${id} and workspace_id = ${user.workspaceId} and (user_id = ${user.id} or ${user.role === "owner" || user.role === "admin"})`;
}

export async function listWebhooks(user: AppUser) {
  return sql<{ id: string; url: string; events: string[]; active: boolean; description: string; createdAt: Date; secret: string }[]>`select id, url, events, active, description, created_at, secret from sign.webhooks where workspace_id = ${user.workspaceId} order by created_at desc`;
}

export async function createWebhook(user: AppUser, input: { url: string; events: string[]; description?: string }) {
  if (!/^https:\/\//.test(input.url)) throw new AppError("bad_url", "Webhook URLs must start with https://");
  const secret = `whsec_${randomToken(24)}`;
  const [w] = await sql<{ id: string }[]>`insert into sign.webhooks (workspace_id, url, secret, events, description, created_by) values (${user.workspaceId}, ${input.url}, ${secret}, ${input.events.length ? input.events : ["*"]}, ${input.description ?? ""}, ${user.id}) returning id`;
  return { id: w.id, secret };
}

export async function deleteWebhook(user: AppUser, id: string) {
  await sql`delete from sign.webhooks where id = ${id} and workspace_id = ${user.workspaceId}`;
}
