"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { createFolderAction } from "@/lib/actions/envelopes";

export function NewFolderButton() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="p-1 rounded text-muted hover:text-ink hover:bg-paper-2" aria-label="New folder"><Plus size={14} /></DialogTrigger>
      <DialogContent title="New folder">
        <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); setBusy(true); const r = await createFolderAction(name); setBusy(false); if (!r.ok) return setErr(r.error); setOpen(false); setName(""); router.refresh(); }}>
          <div className="space-y-1.5"><Label htmlFor="fname">Folder name</Label><Input id="fname" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
          {err ? <p className="text-sm text-bad">{err}</p> : null}
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={busy || !name.trim()}>Create</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
