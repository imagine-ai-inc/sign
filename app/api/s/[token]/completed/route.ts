import { NextResponse } from "next/server";
import { sessionForToken, streamFile } from "../_shared";

export async function GET(request: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const session = await sessionForToken(token);
  if (!session || session.envelope.status !== "completed" || !session.envelope.completedFileId) return NextResponse.json({ error: "not available yet" }, { status: 404 });
  return streamFile(session.envelope.completedFileId, request, "Completed.pdf");
}
