"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { updateWorkspaceSettingsAction } from "@/lib/actions/settings";
import type { WorkspaceSettings } from "@/lib/services/settings";

export function SigningSettingsForm({ settings }: { settings: WorkspaceSettings }) {
  const [f, setF] = useState(settings);
  const [msg, setMsg] = useState<string | null>(null);
  const num = (k: keyof WorkspaceSettings) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: Number(e.target.value) });
  return (
    <form className="mt-6 space-y-6" onSubmit={async (e) => { e.preventDefault(); const r = await updateWorkspaceSettingsAction(f); setMsg(r.ok ? "Saved" : r.error); }}>
      <section className="rounded-lg bg-white border border-hairline p-6 space-y-4">
        <h2 className="font-semibold">Reminders</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5"><Label htmlFor="rd">First reminder (days after sending)</Label><Input id="rd" type="number" min={1} max={60} value={f.reminderDelayDays} onChange={num("reminderDelayDays")} /></div>
          <div className="space-y-1.5"><Label htmlFor="rf">Repeat every (days)</Label><Input id="rf" type="number" min={1} max={60} value={f.reminderFrequencyDays} onChange={num("reminderFrequencyDays")} /></div>
        </div>
      </section>
      <section className="rounded-lg bg-white border border-hairline p-6 space-y-4">
        <h2 className="font-semibold">Expiration</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5"><Label htmlFor="ea">Envelopes expire after (days)</Label><Input id="ea" type="number" min={1} max={999} value={f.expireAfterDays} onChange={num("expireAfterDays")} /></div>
          <div className="space-y-1.5"><Label htmlFor="ew">Warn recipients (days before)</Label><Input id="ew" type="number" min={0} max={60} value={f.expireWarnDays} onChange={num("expireWarnDays")} /></div>
        </div>
      </section>
      <section className="rounded-lg bg-white border border-hairline p-6 space-y-3">
        <h2 className="font-semibold">Recipient permissions</h2>
        <label className="flex items-center gap-2.5 text-sm"><input type="checkbox" className="accent-ink h-4 w-4" checked={f.allowReassignDefault} onChange={(e) => setF({ ...f, allowReassignDefault: e.target.checked })} />Allow recipients to assign to someone else</label>
        <label className="flex items-center gap-2.5 text-sm"><input type="checkbox" className="accent-ink h-4 w-4" checked={f.allowCommentsDefault} onChange={(e) => setF({ ...f, allowCommentsDefault: e.target.checked })} />Allow comments on envelopes</label>
      </section>
      <section className="rounded-lg bg-white border border-hairline p-6 space-y-3">
        <h2 className="font-semibold">Electronic Record and Signature Disclosure</h2>
        <p className="text-sm text-muted">Shown to every recipient before they sign and printed on the certificate. Leave empty to use the built-in disclosure.</p>
        <Textarea rows={10} value={f.disclosureText} onChange={(e) => setF({ ...f, disclosureText: e.target.value })} placeholder="Custom disclosure text (optional)" />
      </section>
      <div className="flex items-center gap-3"><Button type="submit">Save</Button>{msg ? <span className="text-sm text-muted">{msg}</span> : null}</div>
    </form>
  );
}
