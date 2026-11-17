import "server-only";
import type { Db } from "@/lib/db";
import { sha256Hex } from "@/lib/crypto";
import type { RequestMeta } from "@/lib/request-meta";

export interface AuditInput {
  envelopeId: string;
  type: string;
  description: string;
  recipientId?: string | null;
  actorUserId?: string | null;
  actorApiKeyId?: string | null;
  meta?: RequestMeta | null;
  data?: Record<string, unknown>;
}

/** Append to the hash-chained audit trail. Call inside a transaction that holds the envelope row lock when possible. */
export async function appendEvent(db: Db, e: AuditInput) {
  const [prev] = await db<{ hash: string }[]>`select hash from sign.events where envelope_id = ${e.envelopeId} order by id desc limit 1`;
  const at = new Date().toISOString();
  const canonical = JSON.stringify({
    envelopeId: e.envelopeId, type: e.type, description: e.description, recipientId: e.recipientId ?? null,
    actorUserId: e.actorUserId ?? null, actorApiKeyId: e.actorApiKeyId ?? null, ip: e.meta?.ip ?? null, at, data: e.data ?? {},
  });
  const prevHash = prev?.hash ?? null;
  const hash = sha256Hex((prevHash ?? "") + canonical);
  await db`
    insert into sign.events (envelope_id, recipient_id, actor_user_id, actor_api_key_id, type, description, ip, user_agent, geo, data, prev_hash, hash, created_at)
    values (${e.envelopeId}, ${e.recipientId ?? null}, ${e.actorUserId ?? null}, ${e.actorApiKeyId ?? null}, ${e.type}, ${e.description},
            ${e.meta?.ip ?? null}, ${e.meta?.userAgent ?? null}, ${e.meta?.geo ? db.json(e.meta.geo) : null}, ${db.json((e.data ?? {}) as never)}, ${prevHash}, ${hash}, ${at})`;
  await db`update sign.envelopes set last_activity_at = now() where id = ${e.envelopeId}`;
}
