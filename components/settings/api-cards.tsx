"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { createApiKeyAction, revokeApiKeyAction, createWebhookAction, deleteWebhookAction } from "@/lib/actions/settings";
import { fmtDate } from "@/lib/format";

function Secret({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-md border border-hairline bg-paper p-3">
      <div className="text-[12px] text-muted mb-1">{label}. Copy it now, it won&apos;t be shown again.</div>
      <div className="flex items-center gap-2"><code className="flex-1 text-[12.5px] break-all">{value}</code><Button size="sm" variant="secondary" type="button" onClick={async () => { await navigator.clipboard.writeText(value); setCopied(true); }}><Copy size={13} /> {copied ? "Copied" : "Copy"}</Button></div>
    </div>
  );
}

export function ApiKeysCard({ keys }: { keys: { id: string; name: string; prefix: string; userName: string; lastUsedAt: string | null; createdAt: string; revokedAt: string | null }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <section className="mt-6 rounded-lg bg-white border border-hairline">
      <div className="flex items-center justify-between px-5 py-3 border-b border-hairline-2"><h2 className="font-semibold">API keys</h2><Button size="sm" onClick={() => { setCreated(null); setName(""); setOpen(true); }}><Plus size={14} /> Create key</Button></div>
      {keys.length === 0 ? <p className="px-5 py-6 text-sm text-muted">No API keys yet.</p> : (
        <div className="overflow-x-auto"><table className="w-full text-sm min-w-[560px]">
          <thead><tr className="text-left text-[12px] uppercase tracking-wide text-muted border-b border-hairline"><th className="px-5 py-2 font-medium">Name</th><th className="py-2 font-medium">Key</th><th className="py-2 font-medium">Created by</th><th className="py-2 font-medium">Last used</th><th></th></tr></thead>
          <tbody>{keys.map((k) => (
            <tr key={k.id} className={"border-b border-hairline-2 last:border-0 " + (k.revokedAt ? "opacity-50" : "")}>
              <td className="px-5 py-2.5 font-medium">{k.name}{k.revokedAt ? <span className="ml-2 text-[11px] text-muted font-normal">revoked</span> : null}</td>
              <td className="py-2.5 font-mono text-[12px]">{k.prefix}…</td><td className="py-2.5 text-ink-2">{k.userName}</td><td className="py-2.5 text-muted">{k.lastUsedAt ? fmtDate(k.lastUsedAt) : "Never"}</td>
              <td className="py-2 pr-5 text-right">{!k.revokedAt ? <Button size="sm" variant="ghost" onClick={async () => { if (confirm("Revoke this key? Anything using it will stop working.")) { await revokeApiKeyAction(k.id); router.refresh(); } }}>Revoke</Button> : null}</td>
            </tr>))}</tbody>
        </table></div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={created ? "API key created" : "Create API key"} description={created ? undefined : "Keys act as you: they can create, send and read envelopes you can see."}>
          {created ? <div className="space-y-4"><Secret value={created} label="Your new API key" /><div className="flex justify-end"><Button onClick={() => { setOpen(false); router.refresh(); }}>Done</Button></div></div> : (
            <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); const r = await createApiKeyAction(name); if (!r.ok || !r.data) return setErr(r.ok ? "Failed" : r.error); setCreated(r.data.key); }}>
              <div className="space-y-1.5"><Label htmlFor="k-name">Name</Label><Input id="k-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Order form agent" autoFocus /></div>
              {err ? <p className="text-sm text-bad">{err}</p> : null}
              <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={!name.trim()}>Create</Button></div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

export function WebhooksCard({ hooks, events }: { hooks: { id: string; url: string; events: string[]; active: boolean; description: string; createdAt: string }[]; events: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [desc, setDesc] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [created, setCreated] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <section className="mt-6 rounded-lg bg-white border border-hairline">
      <div className="flex items-center justify-between px-5 py-3 border-b border-hairline-2"><h2 className="font-semibold">Webhooks</h2><Button size="sm" onClick={() => { setCreated(null); setUrl(""); setDesc(""); setSel(new Set()); setOpen(true); }}><Plus size={14} /> Add webhook</Button></div>
      {hooks.length === 0 ? <p className="px-5 py-6 text-sm text-muted">No webhooks yet. We POST JSON with an X-Imagine-Signature header for every event you subscribe to.</p> : (
        <ul>{hooks.map((h) => (
          <li key={h.id} className="flex items-center gap-4 px-5 py-3 border-b border-hairline-2 last:border-0">
            <div className="min-w-0 flex-1"><div className="font-mono text-[12.5px] truncate">{h.url}</div><div className="text-xs text-muted mt-0.5">{h.description ? `${h.description} · ` : ""}{h.events.includes("*") ? "All events" : h.events.join(", ")}</div></div>
            <Button size="sm" variant="ghost" onClick={async () => { if (confirm("Delete this webhook?")) { await deleteWebhookAction(h.id); router.refresh(); } }}>Delete</Button>
          </li>))}</ul>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={created ? "Webhook added" : "Add webhook"}>
          {created ? <div className="space-y-4"><Secret value={created} label="Signing secret" /><div className="flex justify-end"><Button onClick={() => { setOpen(false); router.refresh(); }}>Done</Button></div></div> : (
            <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); const r = await createWebhookAction({ url, events: [...sel], description: desc }); if (!r.ok || !r.data) return setErr(r.ok ? "Failed" : r.error); setCreated(r.data.secret); }}>
              <div className="space-y-1.5"><Label htmlFor="w-url">Endpoint URL</Label><Input id="w-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/hooks/imagine-sign" autoFocus /></div>
              <div className="space-y-1.5"><Label htmlFor="w-desc">Description (optional)</Label><Input id="w-desc" value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
              <div><Label>Events (none selected = all)</Label><div className="mt-1.5 grid grid-cols-2 gap-1.5">{events.map((ev) => <label key={ev} className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={sel.has(ev)} onChange={(e) => setSel((s) => { const n = new Set(s); if (e.target.checked) n.add(ev); else n.delete(ev); return n; })} /><code className="text-[12px]">{ev}</code></label>)}</div></div>
              {err ? <p className="text-sm text-bad">{err}</p> : null}
              <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={!url}>Add</Button></div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
