import "server-only";
import { sql } from "@/lib/db";
import type { AppUser } from "@/lib/types";

export type Period = "30d" | "90d" | "12mo" | "all";
export function periodInterval(p: Period): string | null {
  return p === "30d" ? "30 days" : p === "90d" ? "90 days" : p === "12mo" ? "12 months" : null;
}

export interface ReportSummary { sent: number; completed: number; declined: number; voided: number; expired: number; inProgress: number; avgHours: number | null; completionRate: number | null }
export interface SenderRow { userId: string; name: string; email: string; sent: number; completed: number; inProgress: number; avgHours: number | null }

export async function reportSummary(user: AppUser, period: Period): Promise<ReportSummary> {
  const iv = periodInterval(period);
  const since = iv ? sql`and e.sent_at >= now() - ${iv}::interval` : sql``;
  const [r] = await sql<ReportSummary[]>`
    select count(*) filter (where e.sent_at is not null)::int as sent,
           count(*) filter (where e.status = 'completed')::int as completed,
           count(*) filter (where e.status = 'declined')::int as declined,
           count(*) filter (where e.status = 'voided')::int as voided,
           count(*) filter (where e.status = 'expired')::int as expired,
           count(*) filter (where e.status = 'sent')::int as in_progress,
           avg(extract(epoch from (e.completed_at - e.sent_at)) / 3600) filter (where e.status = 'completed')::float as avg_hours,
           case when count(*) filter (where e.sent_at is not null) = 0 then null
                else (count(*) filter (where e.status = 'completed'))::float / (count(*) filter (where e.sent_at is not null)) end as completion_rate
    from sign.envelopes e where e.workspace_id = ${user.workspaceId} and e.deleted_at is null and e.status <> 'template' and e.status <> 'draft' ${since}`;
  return r;
}

export async function reportBySender(user: AppUser, period: Period): Promise<SenderRow[]> {
  const iv = periodInterval(period);
  const since = iv ? sql`and e.sent_at >= now() - ${iv}::interval` : sql``;
  return sql<SenderRow[]>`
    select u.id as user_id, u.name, u.email,
           count(e.id) filter (where e.sent_at is not null)::int as sent,
           count(e.id) filter (where e.status = 'completed')::int as completed,
           count(e.id) filter (where e.status = 'sent')::int as in_progress,
           avg(extract(epoch from (e.completed_at - e.sent_at)) / 3600) filter (where e.status = 'completed')::float as avg_hours
    from sign.users u left join sign.envelopes e on e.owner_id = u.id and e.deleted_at is null and e.status not in ('template','draft') ${since}
    where u.workspace_id = ${user.workspaceId} and u.status <> 'disabled' and u.email not like '%@resend.dev'
    group by u.id, u.name, u.email order by sent desc, u.name`;
}

export async function reportByMonth(user: AppUser, period: Period) {
  const iv = periodInterval(period) ?? "24 months";
  return sql<{ month: string; sent: number; completed: number }[]>`
    select to_char(date_trunc('month', e.sent_at), 'YYYY-MM') as month,
           count(*)::int as sent, count(*) filter (where e.status = 'completed')::int as completed
    from sign.envelopes e where e.workspace_id = ${user.workspaceId} and e.deleted_at is null and e.sent_at is not null and e.status <> 'template'
      and e.sent_at >= now() - ${iv}::interval
    group by 1 order by 1`;
}
