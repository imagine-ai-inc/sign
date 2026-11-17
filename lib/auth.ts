import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { supabaseServer } from "@/lib/supabase/server";
import type { AppUser } from "@/lib/types";

export const getCurrentUser = cache(async (): Promise<AppUser | null> => {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  const authUser = data.user;
  if (!authUser?.email) return null;
  const rows = await sql<AppUser[]>`
    select * from sign.users
    where auth_user_id = ${authUser.id} or lower(email) = lower(${authUser.email})
    order by (auth_user_id = ${authUser.id}) desc nulls last
    limit 1`;
  const user = rows[0];
  if (!user || user.status === "disabled") return null;
  if (!user.authUserId || user.status === "invited") {
    await sql`update sign.users set auth_user_id = ${authUser.id}, status = 'active', last_seen_at = now() where id = ${user.id}`;
    user.authUserId = authUser.id;
    user.status = "active";
  }
  return user;
});

export async function requireUser(): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<AppUser> {
  const user = await requireUser();
  if (user.role !== "owner" && user.role !== "admin") redirect("/");
  return user;
}

export { isAdmin } from "@/lib/roles";
