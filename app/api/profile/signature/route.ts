import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getObject, storeFile } from "@/lib/storage";

function decodePng(dataUrl: string): Uint8Array | null {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || "");
  if (!m) return null;
  const b = new Uint8Array(Buffer.from(m[1], "base64"));
  return b.byteLength > 1_500_000 ? null : b;
}

/** Saves the internal user's own adopted signature (used by Home "My signature" and Settings > Profile). */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { style?: string; font?: string | null; fullName?: string; initials?: string; signaturePng?: string; initialsPng?: string } | null;
  const sig = body?.signaturePng ? decodePng(body.signaturePng) : null;
  const ini = body?.initialsPng ? decodePng(body.initialsPng) : null;
  if (!body || !sig || !ini || !body.fullName?.trim()) return NextResponse.json({ error: "Signature, initials and full name are required" }, { status: 400 });
  const stamp = Date.now();
  const s = await storeFile(sql, { workspaceId: user.workspaceId, path: `users/${user.id}/signature-${stamp}.png`, filename: "signature.png", contentType: "image/png", bytes: sig, kind: "signature", createdBy: user.id });
  const i = await storeFile(sql, { workspaceId: user.workspaceId, path: `users/${user.id}/initials-${stamp}.png`, filename: "initials.png", contentType: "image/png", bytes: ini, kind: "signature", createdBy: user.id });
  const adoption = { style: body.style === "draw" || body.style === "upload" ? body.style : "font", font: body.font ?? null, fullName: body.fullName.trim().slice(0, 120), initials: (body.initials || "").trim().slice(0, 8), signatureFileId: s.id, initialsFileId: i.id, adoptedAt: new Date().toISOString() };
  await sql`update sign.users set signature = ${sql.json(adoption as never)} where id = ${user.id}`;
  return NextResponse.json({ ok: true, adoption });
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const kind = new URL(request.url).searchParams.get("kind") === "initials" ? "initials" : "signature";
  const id = kind === "initials" ? user.signature?.initialsFileId : user.signature?.signatureFileId;
  if (!id) return new NextResponse(null, { status: 404 });
  const [f] = await sql<{ path: string }[]>`select path from sign.files where id = ${id}`;
  if (!f) return new NextResponse(null, { status: 404 });
  const bytes = await getObject(f.path);
  return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=60" } });
}
