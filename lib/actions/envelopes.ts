"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { requestMeta } from "@/lib/request";
import { AppError } from "@/lib/services/access";
import * as E from "@/lib/services/envelopes";
import * as T from "@/lib/services/templates";

export type ActionResult<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };

async function wrap<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof AppError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}

export async function startEnvelope() {
  const user = await requireUser();
  const env = await E.createDraft(user);
  redirect(`/envelopes/${env.id}/prepare`);
}

export async function createDraftAction(): Promise<ActionResult<{ id: string }>> {
  return wrap(async () => {
    const user = await requireUser();
    const env = await E.createDraft(user);
    return { id: env.id };
  });
}

export async function attachUploadAction(envelopeId: string, path: string, filename: string) {
  return wrap(async () => {
    const user = await requireUser();
    const doc = await E.addDocumentFromUpload(user, envelopeId, { path, filename });
    return { id: doc.id, name: doc.name, pageCount: doc.pageCount, fileId: doc.fileId, pages: doc.pages, position: doc.position };
  });
}

export async function renameDocumentAction(envelopeId: string, documentId: string, name: string) {
  return wrap(async () => E.renameDocument(await requireUser(), envelopeId, documentId, name));
}
export async function removeDocumentAction(envelopeId: string, documentId: string) {
  return wrap(async () => E.removeDocument(await requireUser(), envelopeId, documentId));
}
export async function reorderDocumentsAction(envelopeId: string, ids: string[]) {
  return wrap(async () => E.reorderDocuments(await requireUser(), envelopeId, ids));
}
export async function saveDraftAction(envelopeId: string, patch: E.DraftPatch, recipients?: E.RecipientInput[]) {
  return wrap(async () => {
    const user = await requireUser();
    await E.updateDraft(user, envelopeId, patch);
    if (recipients) {
      const recs = await E.setRecipients(user, envelopeId, recipients);
      return { recipients: recs.map((r) => ({ id: r.id, name: r.name, email: r.email, role: r.role, routingOrder: r.routingOrder, colorIndex: r.colorIndex, templateRole: r.templateRole })) };
    }
    return { recipients: undefined };
  });
}
export async function saveFieldsAction(envelopeId: string, fields: E.FieldInput[]) {
  return wrap(async () => E.setFields(await requireUser(), envelopeId, fields));
}
export async function sendEnvelopeAction(envelopeId: string) {
  return wrap(async () => {
    const user = await requireUser();
    await E.sendEnvelope({ user, meta: await requestMeta(), via: "web" }, envelopeId);
    revalidatePath("/agreements");
    return { id: envelopeId };
  });
}
export async function voidEnvelopeAction(envelopeId: string, reason: string) {
  return wrap(async () => {
    const user = await requireUser();
    await E.voidEnvelope({ user, meta: await requestMeta() }, envelopeId, reason);
    revalidatePath(`/agreements/${envelopeId}`);
  });
}
export async function resendEnvelopeAction(envelopeId: string, recipientId?: string) {
  return wrap(async () => {
    const user = await requireUser();
    return E.resendEnvelope({ user, meta: await requestMeta() }, envelopeId, recipientId);
  });
}
export async function deleteEnvelopeAction(envelopeId: string) {
  return wrap(async () => E.deleteEnvelope(await requireUser(), envelopeId));
}
export async function restoreEnvelopeAction(envelopeId: string) {
  return wrap(async () => E.restoreEnvelope(await requireUser(), envelopeId));
}
export async function cloneEnvelopeAction(envelopeId: string) {
  return wrap(async () => ({ id: (await E.cloneEnvelope(await requireUser(), envelopeId)).id }));
}
export async function correctEnvelopeAction(envelopeId: string, input: Parameters<typeof E.correctEnvelope>[2]) {
  return wrap(async () => {
    const user = await requireUser();
    const n = await E.correctEnvelope({ user, meta: await requestMeta() }, envelopeId, input);
    revalidatePath(`/agreements/${envelopeId}`);
    return n;
  });
}
export async function addCommentAction(envelopeId: string, body: string, visibility: "internal" | "everyone") {
  return wrap(async () => {
    const user = await requireUser();
    await E.addComment({ user, meta: await requestMeta() }, envelopeId, body, visibility);
    revalidatePath(`/agreements/${envelopeId}`);
  });
}
export async function setCollaboratorsAction(envelopeId: string, list: { userId: string; permission: "view" | "edit" | "manage" }[]) {
  return wrap(async () => E.setCollaborators(await requireUser(), envelopeId, list));
}
export async function transferOwnershipAction(envelopeId: string, userId: string) {
  return wrap(async () => E.transferOwnership(await requireUser(), envelopeId, userId));
}
export async function moveToFolderAction(envelopeIds: string[], folderId: string | null) {
  return wrap(async () => E.moveToFolder(await requireUser(), envelopeIds, folderId));
}
export async function createFolderAction(name: string) {
  return wrap(async () => E.createFolder(await requireUser(), name));
}
export async function searchContactsAction(q: string) {
  return wrap(async () => E.searchContacts(await requireUser(), q));
}
export async function saveAsTemplateAction(envelopeId: string, name: string) {
  return wrap(async () => ({ id: (await T.saveEnvelopeAsTemplate(await requireUser(), envelopeId, name)).id }));
}
export async function setVisibilityAction(envelopeId: string, visibility: "workspace" | "private") {
  return wrap(async () => {
    const user = await requireUser();
    await E.assertEditPublic(user, envelopeId);
    await E.updateEnvelopeSettings(envelopeId, { visibility });
  });
}
