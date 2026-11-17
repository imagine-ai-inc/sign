"use server";
import { revalidatePath } from "next/cache";
import { requireUser, requireAdmin } from "@/lib/auth";
import { AppError } from "@/lib/services/access";
import * as U from "@/lib/services/users";
import { updateWorkspaceSettings, type WorkspaceSettings } from "@/lib/services/settings";
import type { ActionResult } from "@/lib/actions/envelopes";
import type { Role } from "@/lib/types";

async function wrap<R>(fn: () => Promise<R>): Promise<ActionResult<R>> {
  try { return { ok: true, data: await fn() }; }
  catch (e) {
    if (e instanceof AppError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}

export async function updateProfileAction(input: { name: string; title: string; company: string; timezone: string; notificationPrefs: Record<string, boolean> }) {
  return wrap(async () => { await U.updateProfile(await requireUser(), input); revalidatePath("/settings"); });
}
export async function inviteUserAction(input: { email: string; name: string; role: Role }) {
  return wrap(async () => { await U.inviteUser(await requireAdmin(), input); revalidatePath("/settings/users"); });
}
export async function updateUserRoleAction(userId: string, role: Role | "disabled") {
  return wrap(async () => { await U.updateUserRole(await requireAdmin(), userId, role); revalidatePath("/settings/users"); });
}
export async function createApiKeyAction(name: string) {
  return wrap(async () => { const key = await U.createApiKey(await requireUser(), name); revalidatePath("/settings/api"); return { key }; });
}
export async function revokeApiKeyAction(id: string) {
  return wrap(async () => { await U.revokeApiKey(await requireUser(), id); revalidatePath("/settings/api"); });
}
export async function createWebhookAction(input: { url: string; events: string[]; description?: string }) {
  return wrap(async () => { const w = await U.createWebhook(await requireUser(), input); revalidatePath("/settings/api"); return w; });
}
export async function deleteWebhookAction(id: string) {
  return wrap(async () => { await U.deleteWebhook(await requireUser(), id); revalidatePath("/settings/api"); });
}
export async function updateWorkspaceSettingsAction(patch: Partial<WorkspaceSettings>) {
  return wrap(async () => { await updateWorkspaceSettings(await requireAdmin(), patch); revalidatePath("/settings/workspace"); revalidatePath("/settings/signing"); revalidatePath("/settings/branding"); });
}
