"use client";
import { brand } from "@/lib/brand";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { updateWorkspaceSettingsAction } from "@/lib/actions/settings";
import type { WorkspaceSettings } from "@/lib/services/settings";

export function BrandingForm({ settings }: { settings: WorkspaceSettings }) {
  const [f, setF] = useState(settings);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form className="mt-6 grid lg:grid-cols-[1fr_380px] gap-6 items-start" onSubmit={async (e) => { e.preventDefault(); const r = await updateWorkspaceSettingsAction(f); setMsg(r.ok ? "Saved" : r.error); }}>
      <div className="space-y-6">
        <section className="rounded-lg bg-white border border-hairline p-6 space-y-4">
          <h2 className="font-semibold">Company</h2>
          <div className="space-y-1.5"><Label htmlFor="cn">Company name</Label><Input id="cn" value={f.brandCompanyName} onChange={(e) => setF({ ...f, brandCompanyName: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="lu">Logo URL (PNG, transparent, about 448x140)</Label><Input id="lu" value={f.brandLogoUrl} onChange={(e) => setF({ ...f, brandLogoUrl: e.target.value })} placeholder="https://sign.example.com/brand/logo.png" /></div>
          <div className="space-y-1.5"><Label htmlFor="sn">Email sender name</Label><Input id="sn" value={f.brandSenderName} onChange={(e) => setF({ ...f, brandSenderName: e.target.value })} /><p className="text-xs text-muted">Emails arrive as &quot;&lt;Sender&gt; via {f.brandSenderName || brand.name}&quot;.</p></div>
        </section>
        <div className="flex items-center gap-3"><Button type="submit">Save</Button>{msg ? <span className="text-sm text-muted">{msg}</span> : null}</div>
      </div>
      <aside className="rounded-lg bg-paper border border-hairline p-5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-3">Email preview</div>
        <div className="rounded-md bg-white border border-hairline overflow-hidden">
          <div className="px-5 py-4 border-b border-hairline-2"><img src={f.brandLogoUrl || brand.emailLogo || "/brand/imagine-logo.png"} alt="" className="h-8" /></div>
          <div className="bg-blush-1 px-5 py-8 text-center">
            <div className="text-[15px]">Alex Kim sent you a document to review and sign.</div>
            <div className="mt-4 inline-block bg-ink text-white text-[12px] font-semibold tracking-wide px-5 py-2.5 rounded">REVIEW DOCUMENT</div>
          </div>
          <div className="px-5 py-4 text-[12px] text-muted">Sent by {f.brandSenderName || brand.name}{f.brandCompanyName ? <>, the e-signature service of {f.brandCompanyName}</> : null}.</div>
        </div>
      </aside>
    </form>
  );
}
