/*
 * Optional CLI bootstrap (the app does the same thing on the owner's first login).
 * Creates the workspace and its owner from env, then exits. Safe to re-run.
 *   DATABASE_URL=... OWNER_EMAIL=you@company.com WORKSPACE_NAME="Acme Inc" pnpm bootstrap
 */
import postgres from "postgres";
import { resolveDatabaseUrl } from "../lib/db/url";

const url = resolveDatabaseUrl("migrate");
const owner = (process.env.OWNER_EMAIL || "").trim().toLowerCase();
if (!url || !owner) {
  console.error("Set DATABASE_URL and OWNER_EMAIL");
  process.exit(1);
}
const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });

async function main() {
  const name = (process.env.WORKSPACE_NAME || process.env.NEXT_PUBLIC_COMPANY_NAME || "My workspace").trim();
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "workspace";
  const [ws] = await sql`
    insert into sign.workspaces (name, slug, settings)
    values (${name}, ${slug}, ${sql.json({ reminderDelayDays: 2, reminderFrequencyDays: 3, expireAfterDays: 120, expireWarnDays: 3, timezone: "America/Los_Angeles" })})
    on conflict (slug) do update set name = excluded.name
    returning id`;
  await sql`
    insert into sign.users (workspace_id, email, name, role, status)
    values (${ws.id}, ${owner}, ${owner.split("@")[0]}, 'owner', 'invited')
    on conflict (workspace_id, lower(email)) do update set role = 'owner'`;
  console.log(`workspace "${name}" ready, owner ${owner}. Log in at your app URL with that email.`);
  await sql.end();
}
main().catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
