"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label, NativeSelect } from "@/components/ui/input";
import { updateProfileAction } from "@/lib/actions/settings";

const TZS = ["America/Los_Angeles", "America/Denver", "America/Chicago", "America/New_York", "UTC", "Europe/London", "Europe/Berlin", "Europe/Kyiv", "Asia/Shanghai", "Asia/Tokyo", "Asia/Singapore", "Australia/Sydney"];

export function ProfileForm({ user }: { user: { name: string; email: string; title: string; company: string; timezone: string; role: string; prefs: { viewed: boolean; signed: boolean; declined: boolean } } }) {
  const router = useRouter();
  const [f, setF] = useState(user);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form className="mt-6 space-y-6" onSubmit={async (e) => { e.preventDefault(); setBusy(true); const r = await updateProfileAction({ name: f.name, title: f.title, company: f.company, timezone: f.timezone, notificationPrefs: f.prefs }); setBusy(false); setMsg(r.ok ? "Saved" : r.error); if (r.ok) router.refresh(); }}>
      <section className="rounded-lg bg-white border border-hairline p-6 space-y-4">
        <h2 className="font-semibold">Personal information</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5"><Label htmlFor="name">Full name</Label><Input id="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="email">Email</Label><Input id="email" value={f.email} disabled /></div>
          <div className="space-y-1.5"><Label htmlFor="title">Title</Label><Input id="title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="company">Company</Label><Input id="company" value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} /></div>
        </div>
      </section>
      <section className="rounded-lg bg-white border border-hairline p-6 space-y-4">
        <h2 className="font-semibold">Regional settings</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5"><Label htmlFor="tz">Time zone</Label><NativeSelect id="tz" className="w-full" value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })}>{[...new Set([f.timezone, ...TZS])].map((z) => <option key={z} value={z}>{z}</option>)}</NativeSelect></div>
          <div className="space-y-1.5"><Label>Date format</Label><div className="h-9 flex items-center text-sm">MM/DD/YYYY, 12 hour (shown as {new Date().toLocaleString("en-US", { timeZone: f.timezone, month: "numeric", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })})</div></div>
          <div className="space-y-1.5"><Label>Role</Label><div className="h-9 flex items-center text-sm capitalize">{f.role}</div></div>
        </div>
      </section>
      <section className="rounded-lg bg-white border border-hairline p-6 space-y-3">
        <h2 className="font-semibold">Email notifications</h2>
        <p className="text-sm text-muted">For envelopes you send.</p>
        {([["viewed", "A recipient views the envelope"], ["signed", "A recipient signs or approves"], ["declined", "A recipient declines"]] as const).map(([k, label]) => (
          <label key={k} className="flex items-center gap-2.5 text-sm"><input type="checkbox" checked={f.prefs[k]} onChange={(e) => setF({ ...f, prefs: { ...f.prefs, [k]: e.target.checked } })} />{label}</label>
        ))}
      </section>
      <div className="flex items-center gap-3"><Button type="submit" disabled={busy}>Save</Button>{msg ? <span className="text-sm text-muted">{msg}</span> : null}</div>
    </form>
  );
}
