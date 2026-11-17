"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { requestMeta } from "@/lib/request";
import { AppError } from "@/lib/services/access";
import * as T from "@/lib/services/templates";
import { sendEnvelope } from "@/lib/services/envelopes";
import type { ActionResult } from "@/lib/actions/envelopes";

async function wrap<R>(fn: () => Promise<R>): Promise<ActionResult<R>> {
  try { return { ok: true, data: await fn() }; }
  catch (e) {
    if (e instanceof AppError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}

export async function createTemplateAction(name: string, description: string) {
  const user = await requireUser();
  const { envelopeId } = await T.createTemplate(user, { name, description });
  redirect(`/envelopes/${envelopeId}/prepare`);
}

export async function updateTemplateAction(id: string, patch: { name?: string; description?: string; shared?: boolean }) {
  return wrap(async () => { await T.updateTemplate(await requireUser(), id, patch); revalidatePath("/templates"); });
}

export async function deleteTemplateAction(id: string) {
  return wrap(async () => { await T.deleteTemplate(await requireUser(), id); revalidatePath("/templates"); });
}

export async function useTemplateAction(templateId: string, input: T.UseTemplateInput, mode: "send" | "edit"): Promise<ActionResult<{ id: string; sent: boolean }>> {
  return wrap(async () => {
    const user = await requireUser();
    const env = await T.createEnvelopeFromTemplate(user, templateId, input);
    if (mode === "send") {
      try {
        await sendEnvelope({ user, meta: await requestMeta(), via: "web" }, env.id);
        revalidatePath("/agreements");
        return { id: env.id, sent: true };
      } catch (e) {
        if (e instanceof AppError) return { id: env.id, sent: false };
        throw e;
      }
    }
    return { id: env.id, sent: false };
  });
}
