import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { env } from "@/lib/env";
import { appendEvent } from "@/lib/audit";
import { sendSigningRequest, notifyExpiring } from "@/lib/services/notify";
import { deliverPendingWebhooks, emitWebhook } from "@/lib/services/webhooks";
import { finalizeCompletedEnvelope } from "@/lib/services/completion";

export const maxDuration = 300;

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  // Vercel Cron sends "Authorization: Bearer $CRON_SECRET". In production the secret is mandatory.
  if (!env.cronSecret() && process.env.NODE_ENV === "production") return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  if (env.cronSecret() && auth !== `Bearer ${env.cronSecret()}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const out = { reminders: 0, expired: 0, warned: 0, finalized: 0 };

  // 1) expire overdue envelopes
  const expired = await sql<{ id: string; workspaceId: string }[]>`update sign.envelopes set status = 'expired', expired_at = now() where status = 'sent' and expires_at < now() returning id, workspace_id`;
  for (const e of expired) {
    await appendEvent(sql, { envelopeId: e.id, type: "envelope.expired", description: "Envelope expired" });
    await emitWebhook(e.workspaceId, "envelope.expired", e.id, {});
    out.expired++;
  }

  // 2) reminders: first after reminder_delay_days, then every reminder_frequency_days
  const due = await sql<{ envelopeId: string; recipientId: string }[]>`
    select r.envelope_id, r.id as recipient_id from sign.recipients r join sign.envelopes e on e.id = r.envelope_id
    where e.status = 'sent' and e.reminder_enabled and r.status in ('sent','delivered') and r.role <> 'cc'
      and ((r.last_reminded_at is null and r.sent_at < now() - make_interval(days => e.reminder_delay_days))
        or (r.last_reminded_at is not null and r.last_reminded_at < now() - make_interval(days => e.reminder_frequency_days)))
      and r.reminder_count < 20
    limit 100`;
  for (const d of due) {
    await sendSigningRequest(d.envelopeId, d.recipientId, { reminder: true });
    await sql`update sign.recipients set last_reminded_at = now(), reminder_count = reminder_count + 1 where id = ${d.recipientId}`;
    await appendEvent(sql, { envelopeId: d.envelopeId, recipientId: d.recipientId, type: "reminder.sent", description: "Reminder email sent" });
    out.reminders++;
  }

  // 3) expiring soon warnings (once)
  const warn = await sql<{ id: string }[]>`
    select id from sign.envelopes where status = 'sent' and expire_warn_days > 0 and expires_at < now() + make_interval(days => expire_warn_days)
      and not (metadata ? '_expiryWarned') limit 50`;
  for (const w of warn) {
    await notifyExpiring(w.id);
    await sql`update sign.envelopes set metadata = metadata || '{"_expiryWarned": true}'::jsonb where id = ${w.id}`;
    out.warned++;
  }

  // 4) retry completed envelopes missing their PDF
  const missing = await sql<{ id: string }[]>`select id from sign.envelopes where status = 'completed' and completed_file_id is null and completed_at < now() - interval '2 minutes' limit 5`;
  for (const m of missing) {
    await finalizeCompletedEnvelope(m.id).catch((e) => console.error("finalize retry failed", m.id, e));
    out.finalized++;
  }

  await deliverPendingWebhooks(100);
  return NextResponse.json({ ok: true, ...out });
}
