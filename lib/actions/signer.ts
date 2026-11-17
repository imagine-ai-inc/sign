"use server";
import { cookies } from "next/headers";
import { requestMeta } from "@/lib/request";
import { AppError } from "@/lib/services/access";
import {
  accessCookieName, accessCookieValue, adoptSignature, completeRecipient, declineRecipient, loadSignerSession,
  reassignRecipient, recordConsent, resolveToken, verifyAccessCode,
} from "@/lib/services/signing";
import { adoptStamp, signerHistory, type SignerHistoryRow } from "@/lib/services/signing-extra";

export type SignerActionResult<T = unknown> = { ok: true; data?: T } | { ok: false; error: string; code?: string };

async function wrap<T>(fn: () => Promise<T>): Promise<SignerActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof AppError) return { ok: false, error: e.message, code: e.code };
    console.error(e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

async function accessCookieFor(token: string): Promise<string | null> {
  const resolved = await resolveToken(token);
  if (!resolved) return null;
  const jar = await cookies();
  return jar.get(accessCookieName(resolved.recipient.id))?.value ?? null;
}

export async function accessCodeAction(token: string, code: string): Promise<SignerActionResult> {
  return wrap(async () => {
    const ok = await verifyAccessCode(token, code);
    if (!ok) throw new AppError("bad_code", "That access code isn't right. Check with the sender and try again.");
    const resolved = await resolveToken(token);
    if (!resolved) throw new AppError("invalid_link", "This link is no longer valid", 404);
    const jar = await cookies();
    jar.set(accessCookieName(resolved.recipient.id), accessCookieValue(resolved.recipient.id), {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30,
    });
  });
}

export async function consentAction(token: string): Promise<SignerActionResult> {
  return wrap(async () => recordConsent(token, await requestMeta(), await accessCookieFor(token)));
}

export interface AdoptInput { style: "font" | "draw" | "upload"; font?: string | null; fullName: string; initials: string; signaturePng: string; initialsPng: string }

export async function adoptSignatureAction(token: string, input: AdoptInput): Promise<SignerActionResult<{ signaturePng: string; initialsPng: string; fullName: string; initials: string; signatureId: string | null }>> {
  return wrap(async () => {
    const a = await adoptSignature(token, input, await requestMeta(), await accessCookieFor(token));
    return { signaturePng: input.signaturePng, initialsPng: input.initialsPng, fullName: a.fullName, initials: a.initials, signatureId: a.signatureId ?? null };
  });
}

export async function adoptStampAction(token: string, stampPng: string): Promise<SignerActionResult> {
  return wrap(async () => adoptStamp(token, stampPng, await requestMeta(), await accessCookieFor(token)));
}

export async function historyAction(token: string): Promise<SignerActionResult<SignerHistoryRow[]>> {
  return wrap(async () => signerHistory(token));
}

export async function finishAction(token: string, values: Record<string, string>): Promise<SignerActionResult<{ envelopeCompleted: boolean }>> {
  return wrap(async () => {
    const cookie = await accessCookieFor(token);
    await completeRecipient(token, values, await requestMeta(), cookie);
    const session = await loadSignerSession(token, cookie);
    return { envelopeCompleted: session?.state === "completed" && !!session.envelope.completedFileId };
  });
}

export async function declineAction(token: string, reason: string): Promise<SignerActionResult> {
  return wrap(async () => declineRecipient(token, reason, await requestMeta(), await accessCookieFor(token)));
}

export async function reassignAction(token: string, input: { name: string; email: string; reason: string }): Promise<SignerActionResult> {
  return wrap(async () => reassignRecipient(token, input, await requestMeta(), await accessCookieFor(token)));
}
