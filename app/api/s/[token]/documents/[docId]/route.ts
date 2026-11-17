import { NextResponse } from "next/server";
import { sessionForToken, streamFile } from "../../_shared";

export async function GET(request: Request, ctx: { params: Promise<{ token: string; docId: string }> }) {
  const { token, docId } = await ctx.params;
  const session = await sessionForToken(token);
  if (!session || !["active", "done", "completed"].includes(session.state)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const doc = session.documents.find((d) => d.id === docId);
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  return streamFile(doc.fileId, request, `${doc.name}.pdf`);
}
