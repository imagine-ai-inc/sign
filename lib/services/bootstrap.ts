import "server-only";
import { sql } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * First-run bootstrap for self-hosted installs.
 * If `email` equals OWNER_EMAIL and the database has no owner yet, create the workspace
 * (WORKSPACE_NAME, default NEXT_PUBLIC_COMPANY_NAME or "My workspace") and invite that email as its owner.
 * Once any owner exists this is a no-op: everyone else joins by invite from Settings > Users.
 * Returns true when it created (or re-armed) the owner row.
 */
export async function bootstrapOwner(email: string): Promise<boolean> {
  const owner = env.ownerEmail();
  if (!owner || email.trim().toLowerCase() !== owner) return false;
  return sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext('sign.bootstrap_owner'))`;
    const [existing] = await tx`select 1 from sign.users where role = 'owner' and status <> 'disabled' limit 1`;
    if (existing) return false;
    const name = env.workspaceName().slice(0, 120) || "My workspace";
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "workspace";
    const [ws] = await tx<{ id: string }[]>`
      insert into sign.workspaces (name, slug, settings)
      values (${name}, ${slug}, ${tx.json({ reminderDelayDays: 2, reminderFrequencyDays: 3, expireAfterDays: 120, expireWarnDays: 3, timezone: "America/Los_Angeles" })})
      on conflict (slug) do update set name = sign.workspaces.name
      returning id`;
    const display = owner.split("@")[0].replace(/[._+-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    await tx`
      insert into sign.users (workspace_id, email, name, role, status)
      values (${ws.id}, ${owner}, ${display}, 'owner', 'invited')
      on conflict (workspace_id, lower(email)) do update set role = 'owner', status = 'invited'`;
    return true;
  });
}
