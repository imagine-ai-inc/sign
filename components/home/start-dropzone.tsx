"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, ChevronDown, FileText, LayoutTemplate } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Menu, MenuTrigger, MenuContent, MenuItem, MenuSeparator, MenuLabel } from "@/components/ui/menu";
import { createDraftAction, attachUploadAction } from "@/lib/actions/envelopes";
import { uploadPdf } from "@/lib/upload-client";
import { cn } from "@/lib/cn";

export function StartDropzone({ templates }: { templates: { id: string; name: string }[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start(files: File[]) {
    setError(null);
    setBusy("Creating envelope...");
    const d = await createDraftAction();
    if (!d.ok || !d.data) { setBusy(null); setError(d.ok ? "Could not create envelope" : d.error); return; }
    for (const f of files) {
      try {
        setBusy(`Uploading ${f.name}...`);
        const path = await uploadPdf(f);
        const a = await attachUploadAction(d.data.id, path, f.name);
        if (!a.ok) throw new Error(a.error);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
      }
    }
    router.push(`/envelopes/${d.data.id}/prepare`);
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const files = Array.from(e.dataTransfer.files); if (files.length) start(files); }}
      className={cn("h-full min-h-[220px] rounded-lg border-2 border-dashed flex flex-col items-center justify-center text-center px-6 py-8 transition-colors", over ? "border-ink bg-paper" : "border-hairline")}
    >
      <UploadCloud size={36} className="text-muted" strokeWidth={1.4} />
      <p className="mt-3 text-[15px] font-medium">{busy ?? "Drop documents here to get started"}</p>
      <p className="text-xs text-muted mt-1">PDF up to 25 MB</p>
      <input ref={input} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(e) => { const files = Array.from(e.target.files || []); if (files.length) start(files); e.target.value = ""; }} />
      <div className="mt-5 flex items-center">
        <Button size="lg" className="rounded-r-none" disabled={!!busy} onClick={() => input.current?.click()}>Start</Button>
        <Menu>
          <MenuTrigger asChild>
            <Button size="lg" className="rounded-l-none border-l border-l-white/20 px-3" disabled={!!busy} aria-label="More ways to start"><ChevronDown size={16} /></Button>
          </MenuTrigger>
          <MenuContent align="end">
            <MenuItem onSelect={() => input.current?.click()}><FileText size={15} /> Send an envelope</MenuItem>
            <MenuItem href="/templates"><LayoutTemplate size={15} /> Use a template</MenuItem>
            {templates.length ? <><MenuSeparator /><MenuLabel>Recent templates</MenuLabel></> : null}
            {templates.map((t) => <MenuItem key={t.id} href={`/templates/${t.id}/use`}>{t.name}</MenuItem>)}
          </MenuContent>
        </Menu>
      </div>
      {error ? <p className="text-sm text-bad mt-3">{error}</p> : null}
    </div>
  );
}
