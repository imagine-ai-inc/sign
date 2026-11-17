"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { Eraser, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { SIGNATURE_FONTS } from "@/components/signer/fonts";
import { adoptSignatureAction, type AdoptInput } from "@/lib/actions/signer";
import { initialsOf } from "@/lib/format";
import { cn } from "@/lib/cn";

export interface Adopted { fullName: string; initials: string; signaturePng: string; initialsPng: string; signatureId: string | null; stampPng?: string | null }

const SIG_W = 600, SIG_H = 150, INI_W = 200, INI_H = 150;

async function renderTextPng(text: string, family: string, w: number, h: number): Promise<string> {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  let size = Math.floor(h * 0.62);
  try { await document.fonts.load(`${size}px ${family}`); } catch {}
  ctx.font = `${size}px ${family}`;
  while (size > 18 && ctx.measureText(text).width > w - 24) { size -= 2; ctx.font = `${size}px ${family}`; }
  ctx.fillStyle = "#141414";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 12, h / 2);
  return c.toDataURL("image/png");
}

function trimToPng(src: HTMLCanvasElement, w: number, h: number): string | null {
  const sctx = src.getContext("2d")!;
  const { data } = sctx.getImageData(0, 0, src.width, src.height);
  let minX = src.width, minY = src.height, maxX = -1, maxY = -1;
  for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) {
    if (data[(y * src.width + x) * 4 + 3] > 10) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  if (maxX < 0) return null;
  const out = document.createElement("canvas");
  out.width = w; out.height = h;
  const octx = out.getContext("2d")!;
  const bw = maxX - minX + 1, bh = maxY - minY + 1;
  const s = Math.min((w - 16) / bw, (h - 16) / bh);
  const dw = bw * s, dh = bh * s;
  octx.drawImage(src, minX, minY, bw, bh, 8, (h - dh) / 2, dw, dh);
  return out.toDataURL("image/png");
}

function DrawPad({ label, width, height, padRef }: { label: string; width: number; height: number; padRef: React.MutableRefObject<HTMLCanvasElement | null> }) {
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);
  useEffect(() => {
    const c = padRef.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    c.width = width * dpr; c.height = height * dpr;
    const ctx = c.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = 2.2; ctx.strokeStyle = "#141414";
  }, [padRef, width, height]);
  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * width, y: ((e.clientY - r.top) / r.height) * height };
  }
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[12px] font-medium text-ink-2 uppercase tracking-wide">{label}</span>
        <button type="button" className="text-[12px] text-rose-ink inline-flex items-center gap-1 hover:underline" onClick={() => { const c = padRef.current!; c.getContext("2d")!.clearRect(0, 0, width, height); setEmpty(true); }}><Eraser size={12} /> Clear</button>
      </div>
      <canvas
        ref={padRef}
        style={{ width: "100%", aspectRatio: `${width} / ${height}`, touchAction: "none" }}
        className="block w-full rounded-md border border-dashed border-hairline bg-white cursor-crosshair"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drawing.current = true; last.current = pos(e); }}
        onPointerMove={(e) => {
          if (!drawing.current || !last.current) return;
          const p = pos(e);
          const ctx = e.currentTarget.getContext("2d")!;
          ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(p.x, p.y); ctx.stroke();
          last.current = p; setEmpty(false);
        }}
        onPointerUp={() => { drawing.current = false; last.current = null; }}
        onPointerLeave={() => { drawing.current = false; last.current = null; }}
      />
      {empty ? <p className="text-[11px] text-muted mt-1">Draw with your mouse or finger</p> : null}
    </div>
  );
}

export function AdoptSignatureDialog({ open, onOpenChange, token, defaultName, onAdopted }: { open: boolean; onOpenChange: (o: boolean) => void; token: string; defaultName: string; onAdopted: (a: Adopted) => void }) {
  const [fullName, setFullName] = useState(defaultName);
  const [initials, setInitials] = useState(initialsOf(defaultName));
  const [tab, setTab] = useState<"style" | "draw" | "upload">("style");
  const [font, setFont] = useState<string>(SIGNATURE_FONTS[0].id);
  const [uploadSig, setUploadSig] = useState<string | null>(null);
  const [uploadIni, setUploadIni] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const sigPad = useRef<HTMLCanvasElement | null>(null);
  const iniPad = useRef<HTMLCanvasElement | null>(null);
  const [nameTouched, setNameTouched] = useState(false);

  useEffect(() => { if (!nameTouched) setInitials(initialsOf(fullName)); }, [fullName, nameTouched]);

  async function fileToPng(file: File, w: number, h: number): Promise<string> {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d")!;
      const s = Math.min((w - 16) / img.width, (h - 16) / img.height);
      const dw = img.width * s, dh = img.height * s;
      ctx.drawImage(img, 8, (h - dh) / 2, dw, dh);
      return c.toDataURL("image/png");
    } finally { URL.revokeObjectURL(url); }
  }

  function adopt() {
    setError(null);
    start(async () => {
      try {
        const name = fullName.trim(), ini = initials.trim();
        if (!name || !ini) throw new Error("Enter your full name and initials");
        const f = SIGNATURE_FONTS.find((x) => x.id === font) ?? SIGNATURE_FONTS[0];
        let input: AdoptInput;
        if (tab === "style") {
          input = { style: "font", font: f.label, fullName: name, initials: ini, signaturePng: await renderTextPng(name, f.family, SIG_W, SIG_H), initialsPng: await renderTextPng(ini, f.family, INI_W, INI_H) };
        } else if (tab === "draw") {
          const s = sigPad.current ? trimToPng(sigPad.current, SIG_W, SIG_H) : null;
          if (!s) throw new Error("Draw your signature first");
          const i = (iniPad.current ? trimToPng(iniPad.current, INI_W, INI_H) : null) ?? (await renderTextPng(ini, f.family, INI_W, INI_H));
          input = { style: "draw", fullName: name, initials: ini, signaturePng: s, initialsPng: i };
        } else {
          if (!uploadSig) throw new Error("Upload an image of your signature first");
          input = { style: "upload", fullName: name, initials: ini, signaturePng: uploadSig, initialsPng: uploadIni ?? (await renderTextPng(ini, f.family, INI_W, INI_H)) };
        }
        const r = await adoptSignatureAction(token, input);
        if (!r.ok || !r.data) throw new Error(r.ok ? "Could not save signature" : r.error);
        onAdopted({ fullName: r.data.fullName, initials: r.data.initials, signaturePng: r.data.signaturePng, initialsPng: r.data.initialsPng, signatureId: r.data.signatureId });
        onOpenChange(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not adopt signature");
      }
    });
  }

  const tabCls = "px-4 py-2.5 text-[12px] font-semibold uppercase tracking-wide text-muted border-b-2 border-transparent data-[state=active]:text-ink data-[state=active]:border-ink";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Adopt your signature" description="Confirm your name, initials, and signature." wide>
        <div className="grid sm:grid-cols-[1fr_180px] gap-4">
          <div className="space-y-1.5"><Label htmlFor="adopt-name">Full name *</Label><Input id="adopt-name" value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="adopt-ini">Initials *</Label><Input id="adopt-ini" value={initials} maxLength={8} onChange={(e) => { setNameTouched(true); setInitials(e.target.value.toUpperCase()); }} /></div>
        </div>
        <Tabs.Root value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="mt-5">
          <Tabs.List className="flex border-b border-hairline">
            <Tabs.Trigger value="style" className={tabCls}>Select style</Tabs.Trigger>
            <Tabs.Trigger value="draw" className={tabCls}>Draw</Tabs.Trigger>
            <Tabs.Trigger value="upload" className={tabCls}>Upload</Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="style" className="pt-4">
            <p className="text-[12px] text-muted uppercase tracking-wide font-medium mb-2">Preview</p>
            <div className="grid sm:grid-cols-2 gap-2">
              {SIGNATURE_FONTS.map((f) => (
                <label key={f.id} className={cn("flex items-center gap-3 rounded-md border px-3 py-2 cursor-pointer hover:bg-paper", font === f.id ? "border-ink bg-paper" : "border-hairline")}>
                  <input type="radio" name="sigfont" className="accent-ink" checked={font === f.id} onChange={() => setFont(f.id)} />
                  <div className="flex-1 min-w-0 grid grid-cols-[1fr_auto] gap-3 items-center">
                    <div className="border border-dashed border-hairline rounded px-2 py-1 overflow-hidden">
                      <div className="text-[9px] text-muted leading-none mb-0.5">Signed by:</div>
                      <div className={cn(f.className, "text-[26px] leading-[1.1] whitespace-nowrap overflow-hidden text-ellipsis")}>{fullName || "Your name"}</div>
                    </div>
                    <div className="border border-dashed border-hairline rounded px-2 py-1 w-[64px] text-center">
                      <div className="text-[9px] text-muted leading-none mb-0.5">Initials</div>
                      <div className={cn(f.className, "text-[22px] leading-[1.1]")}>{initials || "YN"}</div>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </Tabs.Content>
          <Tabs.Content value="draw" className="pt-4">
            <div className="grid sm:grid-cols-[1fr_200px] gap-4">
              <DrawPad label="Draw your signature" width={SIG_W} height={SIG_H} padRef={sigPad} />
              <DrawPad label="Draw your initials" width={INI_W} height={INI_H} padRef={iniPad} />
            </div>
          </Tabs.Content>
          <Tabs.Content value="upload" className="pt-4">
            <div className="grid sm:grid-cols-[1fr_200px] gap-4">
              {([["Signature", uploadSig, setUploadSig, SIG_W, SIG_H], ["Initials (optional)", uploadIni, setUploadIni, INI_W, INI_H]] as const).map(([label, val, set, w, h]) => (
                <div key={label}>
                  <span className="text-[12px] font-medium text-ink-2 uppercase tracking-wide">{label}</span>
                  <label className="mt-1.5 flex flex-col items-center justify-center gap-1 rounded-md border border-dashed border-hairline bg-white cursor-pointer hover:bg-paper px-3" style={{ aspectRatio: `${w} / ${h}` }}>
                    {val ? <img src={val} alt="" className="max-h-full max-w-full object-contain" /> : <><Upload size={18} className="text-muted" /><span className="text-[12px] text-muted">Upload image</span></>}
                    <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) set(await fileToPng(f, w, h)); e.target.value = ""; }} />
                  </label>
                </div>
              ))}
            </div>
          </Tabs.Content>
        </Tabs.Root>
        <p className="text-[12px] text-muted mt-5 leading-relaxed">By selecting Adopt and Sign, I agree that the signature and initials will be the electronic representation of my signature and initials for all purposes when I (or my agent) use them on documents, including legally binding contracts.</p>
        {error ? <p className="text-sm text-bad mt-3">{error}</p> : null}
        <div className="mt-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button onClick={adopt} disabled={pending} className="uppercase tracking-wide text-[12px] font-semibold">{pending ? "Saving..." : "Adopt and sign"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
