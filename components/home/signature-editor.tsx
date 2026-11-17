"use client";
import { brand } from "@/lib/brand";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { initialsOf } from "@/lib/format";
import { cn } from "@/lib/cn";

const FONTS = [
  { id: "Dancing Script", css: "'Dancing Script', cursive" },
  { id: "Great Vibes", css: "'Great Vibes', cursive" },
  { id: "Caveat", css: "'Caveat', cursive" },
  { id: "Homemade Apple", css: "'Homemade Apple', cursive" },
];
const SIG_W = 600, SIG_H = 150, INI_W = 200, INI_H = 150;

function textPng(text: string, css: string, w: number, h: number): string {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#141414";
  ctx.textBaseline = "middle";
  let size = h * 0.6;
  do { ctx.font = `${size}px ${css}`; size -= 2; } while (ctx.measureText(text).width > w - 24 && size > 10);
  ctx.fillText(text, 12, h / 2);
  return c.toDataURL("image/png");
}

function usePad(ref: React.RefObject<HTMLCanvasElement | null>) {
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.lineWidth = 2.4; ctx.lineCap = "round"; ctx.strokeStyle = "#141414";
    let down = false;
    const pos = (e: PointerEvent) => { const r = c.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * c.width, ((e.clientY - r.top) / r.height) * c.height] as const; };
    const d = (e: PointerEvent) => { down = true; const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); c.setPointerCapture(e.pointerId); };
    const m = (e: PointerEvent) => { if (!down) return; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); setDirty(true); };
    const u = () => { down = false; };
    c.addEventListener("pointerdown", d); c.addEventListener("pointermove", m); c.addEventListener("pointerup", u); c.addEventListener("pointerleave", u);
    return () => { c.removeEventListener("pointerdown", d); c.removeEventListener("pointermove", m); c.removeEventListener("pointerup", u); c.removeEventListener("pointerleave", u); };
  }, [ref]);
  const clear = () => { const c = ref.current; if (!c) return; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); setDirty(false); };
  return { dirty, clear };
}

export function SignatureEditor({ open, onOpenChange, defaultName, current }: { open: boolean; onOpenChange: (o: boolean) => void; defaultName: string; current: { fullName: string; initials: string } | null }) {
  const router = useRouter();
  const [fullName, setFullName] = useState(current?.fullName || defaultName);
  const [initials, setInitials] = useState(current?.initials || initialsOf(defaultName));
  const [tab, setTab] = useState<"style" | "draw" | "upload">("style");
  const [font, setFont] = useState(FONTS[0].id);
  const [upload, setUpload] = useState<{ sig?: string; ini?: string }>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sigRef = useRef<HTMLCanvasElement | null>(null);
  const iniRef = useRef<HTMLCanvasElement | null>(null);
  const sigPad = usePad(sigRef);
  const iniPad = usePad(iniRef);

  async function save() {
    setError(null);
    let signaturePng = "", initialsPng = "";
    if (tab === "style") {
      const css = FONTS.find((f) => f.id === font)!.css;
      try { await (document as Document & { fonts: FontFaceSet }).fonts.load(`40px ${css}`); } catch { /* fallback */ }
      signaturePng = textPng(fullName, css, SIG_W, SIG_H);
      initialsPng = textPng(initials, css, INI_W, INI_H);
    } else if (tab === "draw") {
      if (!sigPad.dirty) return setError("Draw your signature first");
      signaturePng = sigRef.current!.toDataURL("image/png");
      initialsPng = iniPad.dirty ? iniRef.current!.toDataURL("image/png") : textPng(initials, FONTS[0].css, INI_W, INI_H);
    } else {
      if (!upload.sig) return setError("Upload a signature image first");
      signaturePng = upload.sig;
      initialsPng = upload.ini || textPng(initials, FONTS[0].css, INI_W, INI_H);
    }
    setBusy(true);
    const r = await fetch("/api/profile/signature", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ style: tab === "style" ? "font" : tab, font: tab === "style" ? font : null, fullName, initials, signaturePng, initialsPng }) });
    setBusy(false);
    if (!r.ok) { setError((await r.json().catch(() => ({})))?.error || "Could not save"); return; }
    onOpenChange(false);
    router.refresh();
  }

  function onUpload(kind: "sig" | "ini", file: File | undefined) {
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      const w = kind === "sig" ? SIG_W : INI_W, h = kind === "sig" ? SIG_H : INI_H;
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const ctx = c.getContext("2d")!;
      const s = Math.min(w / img.width, h / img.height);
      ctx.drawImage(img, (w - img.width * s) / 2, (h - img.height * s) / 2, img.width * s, img.height * s);
      setUpload((u) => ({ ...u, [kind]: c.toDataURL("image/png") }));
    };
    img.src = URL.createObjectURL(file);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Adopt your signature" description="Confirm your name, initials and signature." wide>
        <div className="grid sm:grid-cols-[1fr_140px] gap-4">
          <div className="space-y-1.5"><Label>Full name <span className="text-bad">*</span></Label><Input value={fullName} onChange={(e) => { setFullName(e.target.value); setInitials(initialsOf(e.target.value)); }} /></div>
          <div className="space-y-1.5"><Label>Initials <span className="text-bad">*</span></Label><Input value={initials} maxLength={4} onChange={(e) => setInitials(e.target.value.toUpperCase())} /></div>
        </div>
        <div className="mt-5 flex gap-6 border-b border-hairline text-[13px] font-semibold uppercase tracking-wide">
          {(["style", "draw", "upload"] as const).map((t) => <button key={t} onClick={() => setTab(t)} className={cn("pb-2 border-b-2", tab === t ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink")}>{t === "style" ? "Select style" : t}</button>)}
        </div>
        {tab === "style" ? (
          <div className="mt-4 space-y-2">
            <div className="text-xs text-muted">Preview</div>
            {FONTS.map((f) => (
              <label key={f.id} className={cn("flex items-center gap-4 rounded-md border px-4 py-2 cursor-pointer", font === f.id ? "border-ink bg-paper" : "border-hairline")}>
                <input type="radio" name="font" checked={font === f.id} onChange={() => setFont(f.id)} className="accent-ink" />
                <span className="flex-1 text-[30px] leading-tight" style={{ fontFamily: f.css }}>{fullName || "Your name"}</span>
                <span className="w-16 text-[26px] text-center border-l border-hairline" style={{ fontFamily: f.css }}>{initials}</span>
              </label>
            ))}
          </div>
        ) : tab === "draw" ? (
          <div className="mt-4 grid sm:grid-cols-[3fr_1fr] gap-4">
            <div><div className="flex justify-between text-xs text-muted mb-1"><span>Draw your signature</span><button onClick={sigPad.clear} className="text-rose-ink">Clear</button></div><canvas ref={sigRef} width={SIG_W} height={SIG_H} className="w-full border border-hairline rounded bg-white touch-none" /></div>
            <div><div className="flex justify-between text-xs text-muted mb-1"><span>Initials</span><button onClick={iniPad.clear} className="text-rose-ink">Clear</button></div><canvas ref={iniRef} width={INI_W} height={INI_H} className="w-full border border-hairline rounded bg-white touch-none" /></div>
          </div>
        ) : (
          <div className="mt-4 grid sm:grid-cols-2 gap-4">
            <div><Label>Signature image</Label><input type="file" accept="image/*" onChange={(e) => onUpload("sig", e.target.files?.[0])} className="mt-1 text-sm" />{upload.sig ? <img src={upload.sig} alt="" className="mt-2 h-16 border border-hairline bg-white" /> : null}</div>
            <div><Label>Initials image (optional)</Label><input type="file" accept="image/*" onChange={(e) => onUpload("ini", e.target.files?.[0])} className="mt-1 text-sm" />{upload.ini ? <img src={upload.ini} alt="" className="mt-2 h-16 border border-hairline bg-white" /> : null}</div>
          </div>
        )}
        <p className="mt-5 text-[11.5px] text-muted leading-relaxed">By selecting Adopt and Sign, I agree that the signature and initials will be the electronic representation of my signature and initials for all purposes when I (or my agent) use them on documents, including legally binding contracts.</p>
        {error ? <p className="text-sm text-bad mt-2">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={save} disabled={busy || !fullName.trim()}>{busy ? "Saving..." : "Adopt and sign"}</Button></div>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Dancing+Script&family=Great+Vibes&family=Caveat&family=Homemade+Apple&display=swap" />
      </DialogContent>
    </Dialog>
  );
}

export function MySignatureCard({ name, adoption }: { name: string; adoption: { fullName: string; initials: string; adoptedAt: string } | null }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl bg-white border border-hairline">
      <div className="flex items-center justify-between px-5 py-4 border-b border-hairline-2"><h2 className="font-semibold">My signature</h2><button onClick={() => setOpen(true)} className="text-sm text-rose-ink hover:underline">{adoption ? "Edit" : "Create"}</button></div>
      <div className="px-5 py-5">
        {adoption ? (
          <div className="flex items-center gap-4">
            <div className="flex-1 border-l-2 border-ink/50 pl-2"><div className="text-[9px] text-muted">{brand.stampLabel}</div><img src={`/api/profile/signature?kind=signature&v=${encodeURIComponent(adoption.adoptedAt)}`} alt="Signature" className="h-12 object-contain object-left" /></div>
            <div className="w-16 border border-hairline rounded p-1 bg-paper"><img src={`/api/profile/signature?kind=initials&v=${encodeURIComponent(adoption.adoptedAt)}`} alt="Initials" className="h-10 w-full object-contain" /></div>
          </div>
        ) : (
          <button onClick={() => setOpen(true)} className="w-full flex items-center gap-3 rounded-md border border-dashed border-hairline px-4 py-4 text-left hover:border-ink"><PenLine size={18} className="text-muted" /><span className="text-sm">Set up your signature once and sign in one click.</span></button>
        )}
      </div>
      {open ? <SignatureEditor open onOpenChange={setOpen} defaultName={name} current={adoption} /> : null}
    </div>
  );
}
