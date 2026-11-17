/*
 * Applies supabase/migrations/*.sql in order (idempotent, tracked in sign._migrations).
 * Runs automatically before every Vercel build (see vercel.json buildCommand). Locally:
 *   DATABASE_URL=... pnpm migrate
 * Set SKIP_MIGRATIONS=1 to skip (e.g. on preview builds that point at a read-only database).
 */
import postgres from "postgres";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveDatabaseUrl } from "../lib/db/url";

if (/^(1|true|yes)$/i.test(process.env.SKIP_MIGRATIONS ?? "")) {
  console.log("SKIP_MIGRATIONS set, not migrating");
  process.exit(0);
}
const url = resolveDatabaseUrl("migrate");
if (!url) {
  console.error("No database URL. Set DATABASE_URL (or connect the Supabase integration, which sets POSTGRES_URL).");
  process.exit(1);
}
const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {}, connect_timeout: 30 });

async function main() {
  await sql.unsafe(`create schema if not exists sign; create table if not exists sign._migrations (name text primary key, applied_at timestamptz not null default now());`);
  const dir = join(process.cwd(), "supabase/migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const done = new Set((await sql`select name from sign._migrations`).map((r) => r.name as string));
  for (const f of files) {
    if (done.has(f)) continue;
    const body = readFileSync(join(dir, f), "utf8");
    process.stdout.write(`applying ${f} ... `);
    await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext('sign._migrations'))`;
      const [again] = await tx`select 1 from sign._migrations where name = ${f}`;
      if (again) return; // a concurrent build applied it
      await tx.unsafe(body);
      await tx`insert into sign._migrations (name) values (${f})`;
    });
    console.log("ok");
  }
  console.log("migrations up to date");
  await sql.end();
}
main().catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
