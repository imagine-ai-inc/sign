/**
 * Resolves the Postgres connection string. Accepts our own DATABASE_URL* names and the names the
 * Supabase <> Vercel Marketplace integration injects (POSTGRES_URL, POSTGRES_URL_NON_POOLING).
 * No "server-only" import so scripts/migrate.ts can use it too.
 */
export function resolveDatabaseUrl(kind: "app" | "migrate" = "app"): string | null {
  const e = process.env;
  const url = kind === "migrate"
    ? e.DATABASE_URL_SESSION || e.DATABASE_URL || e.POSTGRES_URL || e.POSTGRES_URL_NON_POOLING
    : e.DATABASE_URL || e.POSTGRES_URL;
  if (!url) return null;
  return stripPoolerHints(url);
}

/** The Vercel integration appends ?supa=...&pgbouncer=true for other drivers; postgres.js would forward them as startup params. */
function stripPoolerHints(url: string): string {
  try {
    const u = new URL(url);
    for (const k of ["supa", "pgbouncer", "connection_limit"]) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return url;
  }
}
