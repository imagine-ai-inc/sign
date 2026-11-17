import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sql } from "@/lib/db";
import { storeFile } from "@/lib/storage";
import { accessCookieName, loadSignerSession } from "@/lib/services/signing";

export const maxDuration = 60;

/** Signer attachment upload (Attachment field). multipart/form-data: file, fieldId. Returns { fileId, filename, size }. */
export async function POST(request: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const session = await loadSignerSession(token, null);
  if (!session) return NextResponse.json({ error: { code: "invalid_link", message: "This link is no longer valid" } }, { status: 404 });
  if (session.needsAccessCode) {
    const jar = await cookies();
    const cookie = jar.get(accessCookieName(session.recipient.id))?.value ?? null;
    const s2 = await loadSignerSession(token, cookie);
    if (!s2 || s2.needsAccessCode) return NextResponse.json({ error: { code: "access_code_required", message: "Enter the access code first" } }, { status: 401 });
  }
  if (session.state !== "active") return NextResponse.json({ error: { code: "not_active", message: "This envelope isn't waiting on you" } }, { status: 409 });
  const form = await request.formData();
  const file = form.get("file");
  const fieldId = String(form.get("fieldId") || "");
  if (!(file instanceof File)) return NextResponse.json({ error: { code: "no_file", message: "Choose a file" } }, { status: 400 });
  const field = session.fields.find((f) => f.id === fieldId && f.recipientId === session.recipient.id && f.type === "attachment");
  if (!field) return NextResponse.json({ error: { code: "bad_field", message: "Unknown attachment field" } }, { status: 400 });
  const maxMb = field.options?.maxMb ?? 25;
  if (file.size > maxMb * 1024 * 1024) return NextResponse.json({ error: { code: "too_large", message: `Files must be ${maxMb} MB or smaller` } }, { status: 400 });
  const accept = (field.options?.accept || ".pdf,.png,.jpg,.jpeg").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const ext = "." + (file.name.split(".").pop() || "").toLowerCase();
  if (accept.length && !accept.includes(ext) && !accept.includes("*")) return NextResponse.json({ error: { code: "bad_type", message: `Allowed: ${accept.join(", ")}` } }, { status: 400 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const safeName = file.name.replace(/[^\w\- .()]+/g, "_").slice(0, 120) || "attachment";
  const stored = await storeFile(sql, {
    workspaceId: session.envelope.workspaceId,
    path: `envelopes/${session.envelope.id}/attachments/${session.recipient.id}/${fieldId}-${Date.now()}-${safeName}`,
    filename: safeName,
    contentType: file.type || "application/octet-stream",
    bytes,
    kind: "attachment",
  });
  return NextResponse.json({ fileId: stored.id, filename: safeName, size: bytes.byteLength });
}
