import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createSignedUpload } from "@/lib/storage";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: { code: "unauthorized", message: "Log in first" } }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { filename?: string; size?: number };
  if ((body.size ?? 0) > 25 * 1024 * 1024) return NextResponse.json({ error: { code: "too_large", message: "Files must be 25 MB or smaller" } }, { status: 400 });
  const path = `uploads/${user.workspaceId}/${crypto.randomUUID()}.pdf`;
  const signed = await createSignedUpload(path);
  return NextResponse.json({ path, token: signed.token, signedUrl: signed.signedUrl });
}
