import "server-only";
import { sql } from "@/lib/db";
import type { AppUser, Envelope } from "@/lib/types";
import { isAdmin } from "@/lib/roles";

export class AppError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

export async function collaboratorPermission(envelopeId: string, userId: string): Promise<"view" | "edit" | "manage" | null> {
  const [row] = await sql<{ permission: "view" | "edit" | "manage" }[]>`select permission from sign.envelope_collaborators where envelope_id = ${envelopeId} and user_id = ${userId}`;
  return row?.permission ?? null;
}

export async function canView(user: AppUser, env: Envelope): Promise<boolean> {
  if (env.workspaceId !== user.workspaceId) return false;
  if (env.ownerId === user.id || isAdmin(user) || env.visibility === "workspace") return true;
  return (await collaboratorPermission(env.id, user.id)) !== null;
}

export async function canEdit(user: AppUser, env: Envelope): Promise<boolean> {
  if (env.workspaceId !== user.workspaceId) return false;
  if (env.ownerId === user.id || isAdmin(user)) return true;
  const p = await collaboratorPermission(env.id, user.id);
  if (p === "edit" || p === "manage") return true;
  // Team collaboration default: any member can work on workspace-visible envelopes and templates
  return env.visibility === "workspace" && user.role !== "viewer";
}

export async function loadEnvelope(id: string): Promise<Envelope> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AppError("not_found", "Envelope not found", 404);
  const [env] = await sql<Envelope[]>`select * from sign.envelopes where id = ${id}`;
  if (!env) throw new AppError("not_found", "Envelope not found", 404);
  return env;
}

export async function assertView(user: AppUser, id: string): Promise<Envelope> {
  const env = await loadEnvelope(id);
  if (!(await canView(user, env))) throw new AppError("forbidden", "You don't have access to this envelope", 403);
  return env;
}

export async function assertEdit(user: AppUser, id: string): Promise<Envelope> {
  const env = await loadEnvelope(id);
  if (!(await canEdit(user, env))) throw new AppError("forbidden", "You can't edit this envelope", 403);
  return env;
}
