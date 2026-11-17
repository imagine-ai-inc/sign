"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, LayoutTemplate, Star } from "lucide-react";
import { Button, LinkButton } from "@/components/ui/button";
import { Menu, MenuTrigger, MenuContent, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { updateTemplateAction, deleteTemplateAction } from "@/lib/actions/templates";
import { toggleFavoriteAction, copyTemplateAction } from "@/lib/actions/manage";
import { fmtDate } from "@/lib/format";

interface Row { id: string; envelopeId: string; name: string; description: string; shared: boolean; ownerId: string; ownerName: string; roleNames: string[]; documentCount: number; useCount: number; lastUsedAt: string | null; updatedAt: string; favorite?: boolean }

export function TemplatesTable({ rows, userId, isAdmin, timezone }: { rows: Row[]; userId: string; isAdmin: boolean; timezone: string }) {
  const router = useRouter();
  const [rename, setRename] = useState<Row | null>(null);
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) { const r = await fn(); if (!r.ok) setErr(("error" in r && r.error) || "Something went wrong"); else router.refresh(); }
  return (
    <div className="rounded-lg bg-white border border-hairline">
      {err ? <div className="px-4 py-2 text-sm text-bad border-b border-hairline">{err}</div> : null}
      <div className="overflow-x-auto"><table className="w-full text-sm min-w-[640px]">
        <thead><tr className="text-left text-[12px] uppercase tracking-wide text-muted border-b border-hairline"><th className="w-10 px-3 py-2.5"></th><th className="py-2.5 font-medium">Name</th><th className="py-2.5 font-medium w-[220px]">Roles</th><th className="py-2.5 font-medium w-[150px]">Owner</th><th className="py-2.5 font-medium w-[130px]">Last used</th><th className="w-[200px]"></th></tr></thead>
        <tbody>
          {rows.length === 0 ? <tr><td colSpan={6} className="px-4 py-16 text-center text-muted"><LayoutTemplate size={28} className="mx-auto mb-2 text-muted" strokeWidth={1.4} />No templates yet. Create one, or open a sent envelope and choose Save as template.</td></tr> : rows.map((t) => {
            const canManage = t.ownerId === userId || isAdmin;
            return (
              <tr key={t.id} className="border-b border-hairline-2 last:border-0 hover:bg-paper/50 align-top">
                <td className="px-3 py-3"><button aria-label="Favorite" onClick={() => run(() => toggleFavoriteAction(t.id))} className={t.favorite ? "text-warn" : "text-muted hover:text-ink"}><Star size={16} fill={t.favorite ? "currentColor" : "none"} /></button></td>
                <td className="py-3 pr-4">
                  <a href={`/envelopes/${t.envelopeId}/prepare`} className="font-medium hover:underline">{t.name}</a>
                  <div className="text-[12.5px] text-muted mt-0.5">{t.description || `${t.documentCount} document${t.documentCount === 1 ? "" : "s"}`}{t.shared ? " · Shared with team" : " · Only you"}</div>
                </td>
                <td className="py-3 pr-4 text-ink-2 text-[13px]">{t.roleNames.join(", ") || <span className="text-muted">No roles yet</span>}</td>
                <td className="py-3 pr-4 text-ink-2 text-[13px]">{t.ownerId === userId ? "You" : t.ownerName}</td>
                <td className="py-3 pr-4 text-[13px] text-ink-2">{t.lastUsedAt ? fmtDate(t.lastUsedAt, timezone) : <span className="text-muted">Never</span>}<div className="text-[11.5px] text-muted">Updated {fmtDate(t.updatedAt, timezone)}</div></td>
                <td className="py-2.5 pr-4">
                  <div className="flex items-center justify-end gap-1.5">
                    <LinkButton size="sm" href={`/templates/${t.id}/use`}>Use</LinkButton>
                    <Menu>
                      <MenuTrigger asChild><Button size="icon" variant="ghost" aria-label="More"><MoreHorizontal size={18} /></Button></MenuTrigger>
                      <MenuContent>
                        <MenuItem href={`/templates/${t.id}/use`}>Use</MenuItem>
                        <MenuItem href={`/envelopes/${t.envelopeId}/prepare`}>Edit</MenuItem>
                        <MenuItem onSelect={() => run(() => copyTemplateAction(t.id))}>Create a copy</MenuItem>
                        <MenuItem onSelect={() => run(() => toggleFavoriteAction(t.id))}>{t.favorite ? "Remove from favorites" : "Add to favorites"}</MenuItem>
                        <MenuItem onSelect={() => { setRename(t); setName(t.name); }}>Rename</MenuItem>
                        <MenuItem disabled={!canManage} onSelect={() => run(() => updateTemplateAction(t.id, { shared: !t.shared }))}>{t.shared ? "Stop sharing with team" : "Share with team"}</MenuItem>
                        <MenuSeparator />
                        <MenuItem danger disabled={!canManage} onSelect={() => { if (confirm(`Delete template "${t.name}"?`)) run(() => deleteTemplateAction(t.id)); }}>Delete</MenuItem>
                      </MenuContent>
                    </Menu>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table></div>
      {rename ? (
        <Dialog open onOpenChange={(o) => !o && setRename(null)}>
          <DialogContent title="Rename template">
            <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); await run(() => updateTemplateAction(rename.id, { name })); setRename(null); }}>
              <div className="space-y-1.5"><Label htmlFor="rn">Name</Label><Input id="rn" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
              <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setRename(null)}>Cancel</Button><Button type="submit" disabled={!name.trim()}>Save</Button></div>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
