"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, NativeSelect } from "@/components/ui/input";
import { voidEnvelopeAction, saveAsTemplateAction, moveToFolderAction, createFolderAction } from "@/lib/actions/envelopes";

export function VoidDialog({ id, open, onOpenChange }: { id: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Void envelope" description="Recipients will be notified and the signing links will stop working. This can't be undone.">
        <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); setBusy(true); const r = await voidEnvelopeAction(id, reason); setBusy(false); if (!r.ok) return setErr(r.error); onOpenChange(false); router.refresh(); }}>
          <div className="space-y-1.5"><Label htmlFor="void-reason">Reason for voiding (shared with recipients)</Label><Textarea id="void-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus /></div>
          {err ? <p className="text-sm text-bad">{err}</p> : null}
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" variant="danger" disabled={busy || !reason.trim()}>Void</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SaveAsTemplateDialog({ id, open, onOpenChange, defaultName }: { id: string; open: boolean; onOpenChange: (o: boolean) => void; defaultName: string }) {
  const [name, setName] = useState(defaultName);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Save as template" description="Documents, roles and fields are copied. Recipient names and emails become roles you fill in each time.">
        <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); setBusy(true); const r = await saveAsTemplateAction(id, name); setBusy(false); if (!r.ok) return setErr(r.error); onOpenChange(false); router.push("/templates"); }}>
          <div className="space-y-1.5"><Label htmlFor="tpl-name">Template name</Label><Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
          {err ? <p className="text-sm text-bad">{err}</p> : null}
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={busy || !name.trim()}>Save template</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MoveToFolderDialog({ ids, folders, open, onOpenChange }: { ids: string[]; folders: { id: string; name: string }[]; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [folder, setFolder] = useState<string>(folders[0]?.id ?? "");
  const [newName, setNewName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`Move ${ids.length === 1 ? "envelope" : `${ids.length} envelopes`} to folder`}>
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault(); setBusy(true);
          let target = folder;
          if (folder === "__new") { const c = await createFolderAction(newName); if (!c.ok || !c.data) { setBusy(false); return setErr(c.ok ? "Could not create folder" : c.error); } target = c.data.id; }
          const r = await moveToFolderAction(ids, target || null); setBusy(false); if (!r.ok) return setErr(r.error); onOpenChange(false); router.refresh();
        }}>
          <div className="space-y-1.5">
            <Label htmlFor="folder">Folder</Label>
            <NativeSelect id="folder" className="w-full" value={folder} onChange={(e) => setFolder(e.target.value)}>
              <option value="">No folder</option>
              {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              <option value="__new">New folder...</option>
            </NativeSelect>
          </div>
          {folder === "__new" ? <div className="space-y-1.5"><Label htmlFor="newf">Folder name</Label><Input id="newf" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus /></div> : null}
          {err ? <p className="text-sm text-bad">{err}</p> : null}
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={busy}>Move</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
