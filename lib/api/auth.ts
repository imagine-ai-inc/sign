import "server-only";
import { sql } from "@/lib/db";
import { hashSecret } from "@/lib/crypto";
import { metaFromHeaders } from "@/lib/request";
import type { AppUser } from "@/lib/types";
import type { Actor } from "@/lib/services/envelopes";
import { ApiError } from "@/lib/api/errors";
import { parseBearer } from "@/lib/api/util";

export type Scope = "envelopes:read" | "envelopes:write" | "templates:read" | "templates:write";

export interface ApiKeyInfo {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  workspaceId: string;
}

export interface ApiActor extends Actor {
  user: AppUser;
  apiKeyId: string;
  apiKey: ApiKeyInfo;
  via: "api" | "mcp";
}

const UNAUTHORIZED_HEADERS = { "WWW-Authenticate": 'Bearer realm="imagine-sign", error="invalid_token"' };

/**
 * Bearer isk_ key -> sign.api_keys (key_hash = hashSecret(key), not revoked, not expired)
 * -> owning sign.users row (must not be disabled) -> Actor.
 */
export async function authenticate(req: Request, via: "api" | "mcp" = "api"): Promise<ApiActor> {
  const key = parseBearer(req.headers.get("authorization"));
  if (!key) throw new ApiError("unauthorized", "Missing API key. Send Authorization: Bearer isk_...", 401, undefined, UNAUTHORIZED_HEADERS);
  const [row] = await sql<(ApiKeyInfo & { userId: string; revokedAt: Date | null; expiresAt: Date | null; lastUsedAt: Date | null })[]>`
    select id, name, prefix, scopes, workspace_id, user_id, revoked_at, expires_at, last_used_at
    from sign.api_keys where key_hash = ${hashSecret(key)}`;
  if (!row || row.revokedAt || (row.expiresAt && new Date(row.expiresAt) < new Date())) {
    throw new ApiError("unauthorized", "This API key is invalid, revoked or expired", 401, undefined, UNAUTHORIZED_HEADERS);
  }
  const [user] = await sql<AppUser[]>`select * from sign.users where id = ${row.userId} and workspace_id = ${row.workspaceId}`;
  if (!user || user.status === "disabled") throw new ApiError("unauthorized", "The user who owns this API key is disabled", 401, undefined, UNAUTHORIZED_HEADERS);
  if (!row.lastUsedAt || Date.now() - new Date(row.lastUsedAt).getTime() > 60_000) {
    await sql`update sign.api_keys set last_used_at = now() where id = ${row.id}`.catch(() => {});
  }
  return {
    user,
    apiKeyId: row.id,
    apiKey: { id: row.id, name: row.name, prefix: row.prefix, scopes: row.scopes ?? [], workspaceId: row.workspaceId },
    meta: metaFromHeaders(req.headers),
    via,
  };
}

export function requireScope(actor: ApiActor, scope: Scope) {
  const scopes = actor.apiKey.scopes;
  if (!scopes.length || scopes.includes("*") || scopes.includes(scope)) return;
  // write implies read for the same resource
  const [resource, level] = scope.split(":");
  if (level === "read" && scopes.includes(`${resource}:write`)) return;
  throw new ApiError("insufficient_scope", `This API key is missing the ${scope} scope`, 403);
}

export function requireAdminActor(actor: ApiActor) {
  if (actor.user.role !== "owner" && actor.user.role !== "admin") {
    throw new ApiError("forbidden", "Only workspace owners and admins can manage webhooks", 403);
  }
}
