import "server-only";
import { sql } from "@/lib/db";
import { hmacHex } from "@/lib/crypto";

export const WEBHOOK_EVENTS = [
  "envelope.sent", "envelope.delivered", "recipient.viewed", "recipient.signed", "recipient.declined",
  "recipient.reassigned", "envelope.completed", "envelope.voided", "envelope.expired", "envelope.corrected", "comment.added",
] as const;

interface WebhookRow { id: string; url: string; secret: string; events: string[] }

export async function emitWebhook(workspaceId: string, type: string, envelopeId: string | null, data: Record<string, unknown>) {
  const hooks = await sql<WebhookRow[]>`select id, url, secret, events from sign.webhooks where workspace_id = ${workspaceId} and active`;
  const matching = hooks.filter((h) => h.events.includes("*") || h.events.includes(type));
  if (!matching.length) return;
  const payload = { id: crypto.randomUUID(), type, createdAt: new Date().toISOString(), envelopeId, data };
  for (const h of matching) {
    await sql`insert into sign.webhook_deliveries (webhook_id, event_type, envelope_id, payload) values (${h.id}, ${type}, ${envelopeId}, ${sql.json(payload as never)})`;
  }
  await deliverPendingWebhooks(20).catch(() => {});
}

export async function deliverPendingWebhooks(limit = 50) {
  const rows = await sql<{ id: number; webhookId: string; payload: unknown; attempts: number; url: string; secret: string }[]>`
    select d.id, d.webhook_id, d.payload, d.attempts, w.url, w.secret
    from sign.webhook_deliveries d join sign.webhooks w on w.id = d.webhook_id
    where d.status = 'pending' and d.next_attempt_at <= now() and w.active
    order by d.id limit ${limit}`;
  for (const r of rows) {
    const body = JSON.stringify(r.payload);
    const t = Math.floor(Date.now() / 1000);
    const sig = hmacHex(r.secret, `${t}.${body}`);
    let status = 0;
    let text = "";
    try {
      const res = await fetch(r.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "ImagineSign-Webhooks/1.0", "X-Imagine-Signature": `t=${t},v1=${sig}` },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      status = res.status;
      text = (await res.text()).slice(0, 1000);
    } catch (e) {
      text = e instanceof Error ? e.message : String(e);
    }
    const ok = status >= 200 && status < 300;
    const attempts = r.attempts + 1;
    const backoffMin = [1, 5, 30, 120, 720][Math.min(attempts - 1, 4)];
    await sql`
      update sign.webhook_deliveries set
        attempts = ${attempts}, response_status = ${status || null}, response_body = ${text},
        status = ${ok ? "delivered" : attempts >= 6 ? "failed" : "pending"},
        delivered_at = ${ok ? new Date() : null},
        next_attempt_at = now() + make_interval(mins => ${backoffMin})
      where id = ${r.id}`;
  }
}
