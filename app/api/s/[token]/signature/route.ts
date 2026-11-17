import { NextResponse } from "next/server";
import { sessionForToken, streamFile } from "../_shared";

/** The recipient's own adopted signature / initials image (?kind=initials). */
export async function GET(request: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const session = await sessionForToken(token);
  const a = session?.recipient.signatureAdoption;
  if (!a) return NextResponse.json({ error: "not found" }, { status: 404 });
  const k = new URL(request.url).searchParams.get("kind");
  const kind = k === "initials" ? "initials" : k === "stamp" ? "stamp" : "signature";
  const id = kind === "initials" ? a.initialsFileId : kind === "stamp" ? a.stampFileId : a.signatureFileId;
  if (!id) return NextResponse.json({ error: "not found" }, { status: 404 });
  return streamFile(id, request, `${kind}.png`);
}
