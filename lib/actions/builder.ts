"use server";
import { requireUser } from "@/lib/auth";
import { AppError } from "@/lib/services/access";
import * as T from "@/lib/services/templates";
import { sql } from "@/lib/db";

type R<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };

export async function updateTemplateHeaderAction(templateId: string, patch: { name?: string; description?: string; shared?: boolean }): Promise<R> {
  try {
    const user = await requireUser();
    await T.updateTemplate(user, templateId, patch);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof AppError ? e.message : "Could not save the template" };
  }
}

export async function touchTemplateAction(envelopeId: string): Promise<R> {
  try {
    const user = await requireUser();
    await sql`update sign.templates set updated_at = now() where envelope_id = ${envelopeId} and workspace_id = ${user.workspaceId}`;
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not save" };
  }
}

export async function signNowAction(envelopeId: string): Promise<void> {
  const { redirect } = await import("next/navigation");
  const { issueSigningToken } = await import("@/lib/services/notify");
  const user = await requireUser();
  const [r] = await sql<{ id: string }[]>`select r.id from sign.recipients r join sign.envelopes e on e.id = r.envelope_id
    where r.envelope_id = ${envelopeId} and e.workspace_id = ${user.workspaceId} and lower(r.email) = lower(${user.email}) and r.status in ('sent','delivered') and r.role <> 'cc' limit 1`;
  if (!r) redirect(`/agreements/${envelopeId}`);
  const token = await issueSigningToken(r.id, null);
  redirect(`/s/${token}`);
}
