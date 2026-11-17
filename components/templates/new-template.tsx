"use client";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { createTemplateAction } from "@/lib/actions/templates";

export function NewTemplateButton() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus size={15} /> New template</Button></DialogTrigger>
      <DialogContent title="New template" description="Next you'll add documents, roles and fields, exactly like preparing an envelope.">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); start(() => createTemplateAction(name, desc)); }}>
          <div className="space-y-1.5"><Label htmlFor="t-name">Template name</Label><Input id="t-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="SaaS Services Order Form" autoFocus /></div>
          <div className="space-y-1.5"><Label htmlFor="t-desc">Description (optional)</Label><Textarea id="t-desc" rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={pending || !name.trim()}>{pending ? "Creating..." : "Create"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
