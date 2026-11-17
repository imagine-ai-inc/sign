"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea, NativeSelect } from "@/components/ui/input";
import { addCommentAction } from "@/lib/actions/envelopes";
import { fmtDateTime, initialsOf } from "@/lib/format";

interface C { id: string; body: string; visibility: "internal" | "everyone"; authorName: string; authorEmail: string; createdAt: string }

export function CommentsPanel({ envelopeId, comments, allowed, timezone }: { envelopeId: string; comments: C[]; allowed: boolean; timezone: string }) {
  const [body, setBody] = useState("");
  const [vis, setVis] = useState<"internal" | "everyone">("internal");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  return (
    <aside className="rounded-lg bg-white border border-hairline">
      <div className="px-5 py-3.5 border-b border-hairline-2"><h2 className="font-semibold">Comments</h2></div>
      <div className="px-5 py-3 max-h-[480px] overflow-y-auto space-y-4">
        {comments.length === 0 ? <p className="text-sm text-muted">No comments yet. Team notes stay internal.</p> : comments.map((c) => (
          <div key={c.id} className="flex gap-3">
            <div className="h-8 w-8 rounded-full bg-blush-2 text-[11px] font-semibold flex items-center justify-center shrink-0">{initialsOf(c.authorName || c.authorEmail)}</div>
            <div className="min-w-0">
              <div className="text-[12.5px]"><span className="font-medium">{c.authorName || c.authorEmail}</span> <span className="text-muted">· {fmtDateTime(c.createdAt, timezone)}</span> {c.visibility === "internal" ? <span className="ml-1 text-[10px] uppercase tracking-wide bg-paper-2 text-muted px-1.5 py-0.5 rounded">Team note</span> : null}</div>
              <div className="text-sm text-ink-2 whitespace-pre-wrap mt-0.5">{c.body}</div>
            </div>
          </div>
        ))}
      </div>
      {allowed ? (
        <form className="px-5 py-4 border-t border-hairline-2 space-y-2" onSubmit={async (e) => { e.preventDefault(); setBusy(true); const r = await addCommentAction(envelopeId, body, vis); setBusy(false); if (!r.ok) return setErr(r.error); setBody(""); setErr(null); router.refresh(); }}>
          <Textarea rows={3} placeholder="Add a comment" value={body} onChange={(e) => setBody(e.target.value)} />
          <div className="flex items-center justify-between gap-2">
            <NativeSelect value={vis} onChange={(e) => setVis(e.target.value as "internal" | "everyone")} className="h-8 text-[12.5px]"><option value="internal">Team note</option><option value="everyone">Visible to everyone</option></NativeSelect>
            <Button size="sm" type="submit" disabled={busy || !body.trim()}>Post</Button>
          </div>
          {err ? <p className="text-sm text-bad">{err}</p> : null}
        </form>
      ) : null}
    </aside>
  );
}
