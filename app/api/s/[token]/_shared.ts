import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { accessCookieName, loadSignerSession, resolveToken } from "@/lib/services/signing";
import { getObject } from "@/lib/storage";
import { sql } from "@/lib/db";

export async function sessionForToken(token: string) {
  const resolved = await resolveToken(token);
  if (!resolved) return null;
  const jar = await cookies();
  const session = await loadSignerSession(token, jar.get(accessCookieName(resolved.recipient.id))?.value ?? null);
  if (!session || session.needsAccessCode) return null;
  return session;
}

export async function streamFile(fileId: string, request: Request, fallbackName: string) {
  const [file] = await sql<{ path: string; filename: string; contentType: string }[]>`select path, filename, content_type from sign.files where id = ${fileId}`;
  if (!file) return NextResponse.json({ error: "not found" }, { status: 404 });
  const bytes = await getObject(file.path);
  const download = new URL(request.url).searchParams.get("download") === "1";
  const name = (file.filename || fallbackName).replace(/"/g, "");
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": file.contentType || "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
