"use client";
import { useState } from "react";
import { Download, FileText } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { LinkButton } from "@/components/ui/button";
import { PdfDocument, PdfThumbnails } from "@/components/pdf/pdf-document";
import type { EnvelopeStatus } from "@/lib/types";

export function DocumentsCard({ documents, status, completedFileId, certificateFileId }: { documents: { id: string; name: string; fileId: string; pageCount: number }[]; status: EnvelopeStatus; completedFileId: string | null; certificateFileId: string | null }) {
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);
  const completed = status === "completed" && completedFileId;
  return (
    <section className="rounded-lg bg-white border border-hairline">
      <div className="px-5 py-3.5 border-b border-hairline-2 flex items-center justify-between">
        <h2 className="font-semibold">Documents</h2>
        {completed ? (
          <div className="flex gap-2">
            <LinkButton size="sm" variant="secondary" href={`/api/files/${completedFileId}?download=1`}><Download size={14} /> Completed PDF</LinkButton>
            {certificateFileId ? <LinkButton size="sm" variant="secondary" href={`/api/files/${certificateFileId}?download=1`}>Certificate</LinkButton> : null}
          </div>
        ) : null}
      </div>
      <div className="p-5 flex flex-wrap gap-5">
        {completed ? (
          <button onClick={() => setPreview({ url: `/api/files/${completedFileId}`, name: "Completed document" })} className="group text-left w-[130px]">
            <div className="border border-hairline rounded-sm overflow-hidden group-hover:border-ink"><PdfThumbnails url={`/api/files/${completedFileId}`} /></div>
            <div className="mt-2 text-[12.5px] font-medium flex items-center gap-1"><FileText size={13} /> Completed (signed)</div>
          </button>
        ) : null}
        {documents.map((d) => (
          <button key={d.id} onClick={() => setPreview({ url: `/api/files/${d.fileId}`, name: d.name })} className="group text-left w-[130px]">
            <div className="border border-hairline rounded-sm overflow-hidden max-h-[160px] group-hover:border-ink"><PdfThumbnails url={`/api/files/${d.fileId}`} /></div>
            <div className="mt-2 text-[12.5px] font-medium truncate" title={d.name}>{d.name}.pdf</div>
            <div className="text-[11.5px] text-muted">{d.pageCount} page{d.pageCount === 1 ? "" : "s"}</div>
          </button>
        ))}
      </div>
      {preview ? (
        <Dialog open onOpenChange={(o) => !o && setPreview(null)}>
          <DialogContent title={preview.name} wide className="max-w-[960px]">
            <div className="bg-paper p-4 rounded max-h-[70vh] overflow-y-auto"><PdfDocument url={preview.url} maxWidth={860} /></div>
            <div className="mt-3 flex justify-end"><LinkButton variant="secondary" size="sm" href={`${preview.url}?download=1`}><Download size={14} /> Download</LinkButton></div>
          </DialogContent>
        </Dialog>
      ) : null}
    </section>
  );
}
