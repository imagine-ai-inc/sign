"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { roleLabel } from "@/components/status";
import { useTemplateAction } from "@/lib/actions/templates";
import type { RecipientRole } from "@/lib/types";

interface RoleRow { id: string; role: string; kind: RecipientRole; routingOrder: number; defaultName: string; defaultEmail: string }

export function UseTemplateForm({ templateId, subject, message, roles, signingOrder }: { templateId: string; subject: string; message: string; roles: RoleRow[]; signingOrder: boolean }) {
  const router = useRouter();
  const [vals, setVals] = useState(roles.map((r) => ({ role: r.role, name: r.defaultName, email: r.defaultEmail })));
  const [subj, setSubj] = useState(subject);
  const [msg, setMsg] = useState(message);
  const [busy, setBusy] = useState<"send" | "edit" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function go(mode: "send" | "edit") {
    setBusy(mode); setErr(null);
    const r = await useTemplateAction(templateId, { roles: vals, subject: subj, message: msg }, mode);
    setBusy(null);
    if (!r.ok || !r.data) return setErr(r.ok ? "Something went wrong" : r.error);
    router.push(r.data.sent ? `/agreements/${r.data.id}` : `/envelopes/${r.data.id}/prepare`);
  }
  return (
    <form className="mt-6 space-y-6" onSubmit={(e) => { e.preventDefault(); go("send"); }}>
      <div>
        <h2 className="text-sm font-semibold mb-2">Recipients</h2>
        <div className="space-y-3">
          {roles.length === 0 ? <p className="text-sm text-muted">This template has no roles yet. Edit it first.</p> : roles.map((r, i) => (
            <div key={r.id} className="grid grid-cols-[150px_1fr_1fr] gap-3 items-end">
              <div>
                <div className="text-[13px] font-medium">{signingOrder && r.kind !== "cc" ? `${r.routingOrder}. ` : ""}{r.role}</div>
                <div className="text-[11.5px] text-muted">{roleLabel(r.kind)}</div>
              </div>
              <div className="space-y-1"><Label htmlFor={`n${i}`}>Name</Label><Input id={`n${i}`} value={vals[i].name} onChange={(e) => setVals(vals.map((v, j) => (j === i ? { ...v, name: e.target.value } : v)))} required /></div>
              <div className="space-y-1"><Label htmlFor={`e${i}`}>Email</Label><Input id={`e${i}`} type="email" value={vals[i].email} onChange={(e) => setVals(vals.map((v, j) => (j === i ? { ...v, email: e.target.value } : v)))} required /></div>
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        <h2 className="text-sm font-semibold">Message to all recipients</h2>
        <div className="space-y-1"><Label htmlFor="subj">Email subject</Label><Input id="subj" value={subj} onChange={(e) => setSubj(e.target.value)} required /></div>
        <div className="space-y-1"><Label htmlFor="msg">Email message</Label><Textarea id="msg" rows={4} value={msg} onChange={(e) => setMsg(e.target.value)} /></div>
      </div>
      {err ? <p className="text-sm text-bad">{err}</p> : null}
      <div className="flex items-center justify-end gap-2 border-t border-hairline-2 pt-4">
        <Button type="button" variant="secondary" disabled={!!busy} onClick={() => go("edit")}>{busy === "edit" ? "Creating..." : "Edit before sending"}</Button>
        <Button type="submit" disabled={!!busy || roles.length === 0}>{busy === "send" ? "Sending..." : "Send now"}</Button>
      </div>
    </form>
  );
}
