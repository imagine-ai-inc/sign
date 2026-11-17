"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { updateWorkspaceSettingsAction } from "@/lib/actions/settings";

export function WorkspaceForm({ settings }: { settings: { name: string; reminderDelayDays: number; reminderFrequencyDays: number; expireAfterDays: number; expireWarnDays: number; timezone: string } }) {
  const [f, setF] = useState(settings);
  const [msg, setMsg] = useState<string | null>(null);
  const num = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: Number(e.target.value) });
  return (
    <form className="mt-6 space-y-6" onSubmit={async (e) => { e.preventDefault(); const r = await updateWorkspaceSettingsAction(f); setMsg(r.ok ? "Saved" : r.error); }}>
      <p className="text-sm text-muted">Reminder and expiration defaults moved to <a href="/settings/signing" className="text-rose-ink hover:underline">Signing settings</a>.</p>
      <section className="rounded-lg bg-white border border-hairline p-6 space-y-4">
        <h2 className="font-semibold">Certificates</h2>
        <div className="space-y-1.5 max-w-sm"><Label htmlFor="tz">Time zone printed on certificates of completion</Label><Input id="tz" value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })} /></div>
      </section>
      <div className="flex items-center gap-3"><Button type="submit">Save</Button>{msg ? <span className="text-sm text-muted">{msg}</span> : null}</div>
    </form>
  );
}
