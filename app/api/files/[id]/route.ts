import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getObject } from "@/lib/storage";
import { canView } from "@/lib/services/access";
import { appendEvent } from "@/lib/audit";
import { requestMeta } from "@/lib/request";
import type { Envelope } from "@/lib/types";

/** Authorized download of any file that belongs to an envelope the user can see. ?download=1 forces attachment. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const [file] = await sql<{ id: string; workspaceId: string; path: string; filename: string; contentType: string; kind: string }[]>`select id, workspace_id, path, filename, content_type, kind from sign.files where id = ${id}`;
  if (!file || file.workspaceId !== user.workspaceId) return NextResponse.json({ error: "not found" }, { status: 404 });
  const [env] = await sql<Envelope[]>`
    select e.* from sign.envelopes e where e.id in (
      select envelope_id from sign.documents where file_id = ${id}
      union select id from sign.envelopes where completed_file_id = ${id} or certificate_file_id = ${id}
    ) limit 1`;
  if (env && !(await canView(user, env))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const bytes = await getObject(file.path);
  const url = new URL(request.url);
  const download = url.searchParams.get("download") === "1";
  if (download && env && (file.kind === "completed" || file.kind === "certificate")) {
    await appendEvent(sql, { envelopeId: env.id, type: "document.downloaded", description: `${user.name} downloaded ${file.filename}`, actorUserId: user.id, meta: await requestMeta() });
  }
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${file.filename.replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
