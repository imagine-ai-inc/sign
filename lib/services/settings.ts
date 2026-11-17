import { brand } from "@/lib/brand";
import "server-only";
import { sql } from "@/lib/db";
import type { AppUser } from "@/lib/types";

export interface WorkspaceSettings {
  reminderDelayDays: number;
  reminderFrequencyDays: number;
  expireAfterDays: number;
  expireWarnDays: number;
  timezone: string;
  allowReassignDefault: boolean;
  allowCommentsDefault: boolean;
  disclosureText: string; // empty = built-in disclosure
  brandCompanyName: string;
  brandLogoUrl: string;
  brandSenderName: string; // defaults to NEXT_PUBLIC_BRAND_NAME
}

export async function getWorkspaceSettings(user: AppUser): Promise<WorkspaceSettings & { name: string }> {
  const [ws] = await sql<{ name: string; settings: Partial<WorkspaceSettings> }[]>`select name, settings from sign.workspaces where id = ${user.workspaceId}`;
  const s = ws?.settings ?? {};
  return { name: ws?.name ?? "Workspace", reminderDelayDays: s.reminderDelayDays ?? 2, reminderFrequencyDays: s.reminderFrequencyDays ?? 3, expireAfterDays: s.expireAfterDays ?? 120, expireWarnDays: s.expireWarnDays ?? 3, timezone: s.timezone ?? "America/Los_Angeles",
    allowReassignDefault: s.allowReassignDefault ?? true, allowCommentsDefault: s.allowCommentsDefault ?? true, disclosureText: s.disclosureText ?? "",
    brandCompanyName: s.brandCompanyName ?? (brand.company || ws?.name || ""), brandLogoUrl: s.brandLogoUrl ?? "", brandSenderName: s.brandSenderName ?? brand.name };
}

export async function updateWorkspaceSettings(user: AppUser, patch: Partial<WorkspaceSettings>) {
  const clamp = (n: unknown, min: number, max: number, d: number) => { const v = Math.round(Number(n)); return Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : d; };
  const cur = await getWorkspaceSettings(user);
  const next: WorkspaceSettings = {
    reminderDelayDays: clamp(patch.reminderDelayDays, 1, 60, cur.reminderDelayDays),
    reminderFrequencyDays: clamp(patch.reminderFrequencyDays, 1, 60, cur.reminderFrequencyDays),
    expireAfterDays: clamp(patch.expireAfterDays, 1, 999, cur.expireAfterDays),
    expireWarnDays: clamp(patch.expireWarnDays, 0, 60, cur.expireWarnDays),
    timezone: patch.timezone || cur.timezone,
    allowReassignDefault: patch.allowReassignDefault ?? cur.allowReassignDefault,
    allowCommentsDefault: patch.allowCommentsDefault ?? cur.allowCommentsDefault,
    disclosureText: (patch.disclosureText ?? cur.disclosureText).slice(0, 20000),
    brandCompanyName: (patch.brandCompanyName ?? cur.brandCompanyName).slice(0, 120),
    brandLogoUrl: (patch.brandLogoUrl ?? cur.brandLogoUrl).slice(0, 500),
    brandSenderName: (patch.brandSenderName ?? cur.brandSenderName).slice(0, 80),
  };
  await sql`update sign.workspaces set settings = settings || ${sql.json(next as never)} where id = ${user.workspaceId}`;
}

export async function findCompletedBySha(sha256: string) {
  const [env] = await sql<{ id: string; subject: string; completedAt: Date; signers: string[] }[]>`
    select e.id, e.subject, e.completed_at,
      coalesce((select array_agg(r.name order by r.routing_order, r.position) from sign.recipients r where r.envelope_id = e.id and r.role in ('signer','approver') and r.status = 'completed'), '{}') as signers
    from sign.envelopes e where e.completed_sha256 = ${sha256.toLowerCase()} and e.status = 'completed' limit 1`;
  return env ?? null;
}
