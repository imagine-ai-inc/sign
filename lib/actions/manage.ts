"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { AppError, assertView } from "@/lib/services/access";
import { issueSigningToken } from "@/lib/services/notify";
import type { ActionResult } from "@/lib/actions/envelopes";

async function wrap<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try { return { ok: true, data: await fn() }; }
  catch (e) {
    if (e instanceof AppError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}

/** Internal user signs an envelope addressed to them: issue a signing link and go there. */
export async function signNowAction(envelopeId: string) {
  const user = await requireUser();
  const env = await assertView(user, envelopeId);
  const [r] = await sql<{ id: string }[]>`select id from sign.recipients where envelope_id = ${env.id} and lower(email) = lower(${user.email}) and status in ('sent','delivered') and role <> 'cc' order by routing_order limit 1`;
  if (!r) redirect(`/agreements/${envelopeId}`);
  const token = await issueSigningToken(r.id, env.expiresAt);
  redirect(`/s/${token}`);
}

export async function bulkDeleteAction(ids: string[]) {
  return wrap(async () => {
    const { deleteEnvelope } = await import("@/lib/services/envelopes");
    const user = await requireUser();
    for (const id of ids) await deleteEnvelope(user, id);
    revalidatePath("/agreements");
  });
}

export async function bulkRestoreAction(ids: string[]) {
  return wrap(async () => {
    const { restoreEnvelope } = await import("@/lib/services/envelopes");
    const user = await requireUser();
    for (const id of ids) await restoreEnvelope(user, id);
    revalidatePath("/agreements");
  });
}

export async function refreshAgreements(path = "/agreements") {
  revalidatePath(path);
}

/** Home "Sign a document": draft with the current user as the only signer, then open the prepare page. */
export async function signMyselfAction() {
  const { createDraft, writeRecipients } = await import("@/lib/services/envelopes");
  const user = await requireUser();
  const env = await createDraft(user);
  await writeRecipients(env, [{ name: user.name || user.email, email: user.email, role: "signer" }]);
  redirect(`/envelopes/${env.id}/prepare?me=1`);
}

export async function toggleFavoriteAction(templateId: string) {
  return wrap(async () => {
    const { toggleFavoriteTemplate } = await import("@/lib/services/favorites");
    const fav = await toggleFavoriteTemplate(await requireUser(), templateId);
    revalidatePath("/templates");
    return { favorite: fav };
  });
}

export async function restoreTemplateAction(id: string) {
  return wrap(async () => {
    const { restoreTemplate } = await import("@/lib/services/favorites");
    await restoreTemplate(await requireUser(), id);
    revalidatePath("/templates");
  });
}

export async function copyTemplateAction(templateId: string) {
  return wrap(async () => {
    const { getTemplate } = await import("@/lib/services/templates");
    const { copyEnvelope } = await import("@/lib/services/envelopes");
    const user = await requireUser();
    const t = await getTemplate(user, templateId);
    const env = await copyEnvelope(user, t.envelopeId, { status: "template" });
    const [nt] = await sql<{ id: string }[]>`insert into sign.templates (workspace_id, owner_id, name, description, envelope_id, shared) values (${user.workspaceId}, ${user.id}, ${t.name + " (copy)"}, ${t.description}, ${env.id}, false) returning id`;
    revalidatePath("/templates");
    return { id: nt.id, envelopeId: env.id };
  });
}

/** Export form data (field label/value per recipient) as CSV text. */
export async function exportFormDataAction(envelopeId: string) {
  return wrap(async () => {
    const { getBundle } = await import("@/lib/services/envelopes");
    const user = await requireUser();
    await assertView(user, envelopeId);
    const b = await getBundle(envelopeId);
    const esc = (s: string) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const rows = [["Recipient", "Email", "Field", "Type", "Value"].map(esc).join(",")];
    for (const f of b.fields) {
      const r = b.recipients.find((x) => x.id === f.recipientId);
      if (!r || ["signature", "initials", "note"].includes(f.type)) continue;
      rows.push([r.name, r.email, f.label || f.type, f.type, f.value ?? ""].map(esc).join(","));
    }
    return { csv: rows.join("\n"), filename: `${(b.envelope.subject || "envelope").replace(/[^\w\- ]+/g, "")}-form-data.csv` };
  });
}
