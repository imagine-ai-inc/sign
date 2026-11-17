import { NextResponse } from "next/server";
import { sessionForToken, streamFile } from "../_shared";

export async function GET(request: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const session = await sessionForToken(token);
  if (!session || session.envelope.status !== "completed" || !session.envelope.certificateFileId) return NextResponse.json({ error: "not available yet" }, { status: 404 });
  return streamFile(session.envelope.certificateFileId, request, "Certificate of Completion.pdf");
}
