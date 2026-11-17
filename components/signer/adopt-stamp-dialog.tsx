"use client";
import { useState, useTransition } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { adoptStampAction } from "@/lib/actions/signer";

async function fileToPng(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const max = 600;
    const s = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.width * s));
    c.height = Math.max(1, Math.round(img.height * s));
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function AdoptStampDialog({ open, onOpenChange, token, onAdopted }: { open: boolean; onOpenChange: (o: boolean) => void; token: string; onAdopted: (png: string) => void }) {
  const [png, setPng] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Adopt Your Stamp" description="Upload an image of your company stamp or seal. It will be placed wherever a stamp is requested.">
        <label className="block border-2 border-dashed border-hairline rounded-lg p-6 text-center cursor-pointer hover:border-ink-2">
          <input type="file" accept="image/png,image/jpeg" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setError(null); setPng(await fileToPng(f)); } e.target.value = ""; }} />
          {png ? <img src={png} alt="Stamp preview" className="max-h-[160px] mx-auto" /> : <><Upload className="mx-auto text-muted" /><p className="text-sm mt-2">Choose a PNG or JPG</p></>}
        </label>
        <p className="text-[11px] text-muted mt-4 leading-relaxed">By selecting Adopt and Stamp, I agree that this stamp will be the electronic representation of my stamp for all purposes when I (or my agent) use it on documents, including legally binding contracts.</p>
        {error ? <p className="text-sm text-bad mt-2">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button disabled={!png || pending} className="uppercase tracking-wide text-[12px] font-semibold" onClick={() => start(async () => {
            const r = await adoptStampAction(token, png!);
            if (!r.ok) { setError(r.error); return; }
            onAdopted(png!);
            onOpenChange(false);
          })}>{pending ? "Saving..." : "Adopt and Stamp"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
