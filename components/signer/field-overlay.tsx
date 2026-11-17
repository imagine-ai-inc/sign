"use client";
import { brand } from "@/lib/brand";
import { useEffect, useRef, useState } from "react";
import { PenLine, Check, Paperclip, X, Stamp as StampIcon } from "lucide-react";
import type { PageSize } from "@/components/pdf/pdf-document";
import type { PageMeta, FieldOptions } from "@/lib/types";
import type { SignerField } from "@/components/signer/types";
import { SignatureStamp, shortSignatureId } from "@/components/signer/signature-stamp";
import { cn } from "@/lib/cn";

export interface AdoptedView { signaturePng: string; initialsPng: string; fullName: string; signatureId: string | null; stampPng?: string | null }

export interface FieldOverlayProps {
  fields: SignerField[]; // fields on this page of this document
  size: PageSize;
  pageMeta: PageMeta | undefined;
  values: Record<string, string>;
  missing: Set<string>;
  invalid: Record<string, string>; // field id -> validation message
  hidden: Set<string>; // inactive by conditional logic
  formulas: Record<string, string>; // formula field id -> display value
  readOnly: boolean;
  adopted: AdoptedView | null;
  prefill: { name: string; email: string; today: string };
  token: string;
  onChange: (id: string, value: string) => void;
  onBlur: (field: SignerField) => void;
  onSignatureClick: (field: SignerField) => void;
  onStampClick: (field: SignerField) => void;
  onRadio: (group: string | undefined, field: SignerField) => void;
  onApprove: (field: SignerField) => void;
  onDecline: (field: SignerField) => void;
  registerRef: (id: string, el: HTMLElement | null) => void;
  nextTarget: string | null;
  onNext: () => void;
  started: boolean;
}

/** Mirrors lib/pdf fitSize: max 11pt, min 5pt, 72% of the box height. */
export function fieldFontPx(field: SignerField, size: PageSize, pageMeta: PageMeta | undefined) {
  const pageHpt = pageMeta?.height ?? 792;
  const scale = size.height / pageHpt;
  const boxHpt = field.height * pageHpt;
  const pt = Math.max(5, Math.min(field.options?.fontSize ?? 11, boxHpt * 0.72));
  return pt * scale;
}

function textStyle(o: FieldOptions | undefined): React.CSSProperties {
  return {
    fontFamily: o?.font === "times" ? "'Times New Roman', Times, serif" : o?.font === "courier" ? "Courier, 'Courier New', monospace" : undefined,
    fontWeight: o?.bold ? 700 : undefined,
    fontStyle: o?.italic ? "italic" : undefined,
    textDecoration: o?.underline ? "underline" : undefined,
    color: o?.fontColor || undefined,
  };
}

export function FieldOverlay(p: FieldOverlayProps) {
  const target = p.nextTarget ? p.fields.find((f) => f.id === p.nextTarget) : null;
  return (
    <>
      {p.fields.filter((f) => !p.hidden.has(f.id)).map((f) => <FieldBox key={f.id} field={f} {...p} />)}
      {target ? (
        <>
          {/* Desktop: DocuSign-style tag in the left margin, vertically centered on the field */}
          <button
            type="button"
            onClick={p.onNext}
            className="hidden sm:flex absolute z-20 -left-[46px] -translate-y-1/2 items-center h-7 pl-2 pr-1.5 bg-rose text-ink text-[11px] font-bold uppercase tracking-wide rounded-md shadow-md hover:bg-rose-2"
            style={{ top: `${((target.y + target.height / 2) * 100).toFixed(3)}%` }}
          >
            {p.started ? "Next" : "Start"}
            <span className="ml-1 w-0 h-0 border-y-[7px] border-y-transparent border-l-[7px] border-l-ink/70" />
          </button>
          {/* Mobile: no margin to sit in, so float just above the field instead of covering it */}
          <button
            type="button"
            onClick={p.onNext}
            className="sm:hidden absolute z-20 -translate-y-full flex items-center h-6 pl-2 pr-1.5 bg-rose text-ink text-[10px] font-bold uppercase tracking-wide rounded-md shadow-md"
            style={{ top: `calc(${(target.y * 100).toFixed(3)}% - 3px)`, left: `${(Math.min(target.x, 0.8) * 100).toFixed(3)}%` }}
          >
            {p.started ? "Next" : "Start"}
            <span className="ml-1 w-0 h-0 border-x-[5px] border-x-transparent border-t-[6px] border-t-ink/70" />
          </button>
        </>
      ) : null}
    </>
  );
}

function FieldBox(props: FieldOverlayProps & { field: SignerField }) {
  const { field: f, size, pageMeta, values, missing, invalid, formulas, readOnly, adopted, prefill, token, onChange, onBlur, onSignatureClick, onStampClick, onRadio, onApprove, onDecline, registerRef } = props;
  const style: React.CSSProperties = { position: "absolute", left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.width * 100}%`, height: `${f.height * 100}%` };
  const fontPx = fieldFontPx(f, size, pageMeta);
  const v = values[f.id] ?? "";
  const isMissing = missing.has(f.id);
  const bad = invalid[f.id];
  const mine = f.mine && !readOnly && !f.readOnly;
  const hPx = f.height * size.height, wPx = f.width * size.width;
  const tip = f.options?.tooltip || undefined;

  // Other recipients' completed values (and my own read-only / note fields)
  if (!mine) {
    if (f.type === "note") return <div ref={(el) => registerRef(f.id, el)} style={{ ...style, fontSize: fontPx, background: "#FFF8E1", border: "1px solid #E8D8A0", padding: 2, overflow: "hidden", whiteSpace: "pre-wrap", lineHeight: 1.15 }}>{f.value}</div>;
    if (f.type === "signature" || f.type === "initials" || f.type === "stamp") {
      if (!f.value) return null;
      const own = f.mine && adopted ? adopted : null;
      const src = own ? (f.type === "signature" ? own.signaturePng : f.type === "initials" ? own.initialsPng : own.stampPng ?? null) : null;
      if (f.type === "stamp") return <div ref={(el) => registerRef(f.id, el)} style={style} className="flex items-center">{src ? <img src={src} alt="" className="max-h-full max-w-full object-contain" /> : <span className="text-[10px] text-muted italic">Stamped by {f.ownerName}</span>}</div>;
      return (
        <div ref={(el) => registerRef(f.id, el)} style={style}>
          <SignatureStamp heightPx={hPx} widthPx={wPx} small={f.type === "initials"} label={f.type === "initials" ? brand.initialsLabel : brand.stampLabel} id={own && f.type === "signature" ? shortSignatureId(own.signatureId) : null} src={src} text={src ? null : `Signed by ${f.ownerName}`} />
        </div>
      );
    }
    if (f.type === "checkbox" || f.type === "radio") {
      const on = f.type === "checkbox" ? f.value === "true" : !!f.value && f.value === f.options?.optionValue;
      return <div ref={(el) => registerRef(f.id, el)} style={style} className="flex items-center justify-center"><span className={cn("w-full h-full max-w-full max-h-full border border-ink flex items-center justify-center", f.type === "radio" && "rounded-full")}>{on ? (f.type === "checkbox" ? <Check size={Math.max(8, size.width * f.width * 0.9)} strokeWidth={3} /> : <span className="w-1/2 h-1/2 rounded-full bg-ink" />) : null}</span></div>;
    }
    if (f.type === "drawing") return f.value ? <div ref={(el) => registerRef(f.id, el)} style={style} className="border border-hairline-2" /> : null;
    if (f.type === "attachment") return f.value ? <div ref={(el) => registerRef(f.id, el)} style={{ ...style, fontSize: fontPx }} className="flex items-center gap-1 text-muted"><Paperclip size={Math.max(8, hPx * 0.7)} /></div> : null;
    if (f.type === "approve") return f.value ? <div ref={(el) => registerRef(f.id, el)} style={{ ...style, fontSize: fontPx }} className="flex items-center text-ok font-medium">Approved by {f.ownerName}</div> : null;
    if (f.type === "decline") return null;
    const text = f.type === "formula" && f.mine ? formulas[f.id] ?? f.value : f.value;
    return <div ref={(el) => registerRef(f.id, el)} style={{ ...style, fontSize: fontPx, lineHeight: 1, ...textStyle(f.options) }} className="flex items-center overflow-hidden whitespace-nowrap text-ink pl-px">{text}</div>;
  }

  const base = cn("absolute transition-shadow", isMissing || bad ? "ring-2 ring-bad/70" : "");

  if (f.type === "signature" || f.type === "initials") {
    const stamped = v === "signed" || v === "initialed";
    const src = adopted ? (f.type === "signature" ? adopted.signaturePng : adopted.initialsPng) : null;
    return (
      <button
        ref={(el) => registerRef(f.id, el)}
        type="button"
        data-field={f.id}
        onClick={() => onSignatureClick(f)}
        title={tip ?? (stamped ? (f.required ? "Signed" : "Click to clear") : f.type === "signature" ? "Click to sign" : "Click to initial")}
        style={style}
        className={cn(base, "group flex items-center justify-start text-left focus-ring", stamped ? "bg-transparent" : "bg-[#FCE3E5] border border-[#E58D97] rounded-[3px] hover:bg-rose-1/70")}
      >
        {stamped && src ? (
          <SignatureStamp heightPx={hPx} widthPx={wPx} small={f.type === "initials"} label={f.type === "initials" ? brand.initialsLabel : brand.stampLabel} id={f.type === "signature" ? shortSignatureId(adopted?.signatureId) : null} src={src} />
        ) : (
          <span className="flex items-center gap-1 pl-1 text-[#7A3440] font-semibold leading-none overflow-hidden" style={{ fontSize: Math.max(9, Math.min(13, hPx * 0.5)) }}>
            <PenLine size={Math.max(9, Math.min(14, hPx * 0.5))} />
            {f.type === "signature" ? "Sign" : "Initial"}
            {f.required ? <span className="text-bad"> *</span> : null}
          </span>
        )}
      </button>
    );
  }

  if (f.type === "stamp") {
    const stamped = v === "stamped" && !!adopted?.stampPng;
    return (
      <button ref={(el) => registerRef(f.id, el)} type="button" data-field={f.id} onClick={() => onStampClick(f)} title={tip ?? (stamped ? "Click to remove" : "Click to stamp")} style={style}
        className={cn(base, "flex items-center justify-center focus-ring", stamped ? "bg-transparent" : "bg-[#FCE3E5] border border-[#E58D97] rounded-[3px] hover:bg-rose-1/70")}>
        {stamped ? <img src={adopted!.stampPng!} alt="Your stamp" className="max-h-full max-w-full object-contain pointer-events-none" /> : (
          <span className="flex flex-col items-center gap-0.5 text-[#7A3440] font-semibold leading-none" style={{ fontSize: Math.max(9, Math.min(13, hPx * 0.18)) }}>
            <StampIcon size={Math.max(12, Math.min(22, hPx * 0.3))} />Stamp{f.required ? <span className="text-bad">*</span> : null}
          </span>
        )}
      </button>
    );
  }

  if (f.type === "date_signed") {
    return <div ref={(el) => registerRef(f.id, el)} style={{ ...style, fontSize: fontPx, lineHeight: 1, ...textStyle(f.options) }} className="flex items-center overflow-hidden whitespace-nowrap bg-paper/80 border border-dashed border-hairline rounded-[2px] pl-px text-ink">{prefill.today}</div>;
  }
  if (f.type === "name" || f.type === "email" || f.type === "first_name" || f.type === "last_name") {
    const name = adopted?.fullName || prefill.name;
    const [first, ...rest] = name.split(/\s+/);
    const text = f.type === "name" ? name : f.type === "email" ? prefill.email : f.type === "first_name" ? first : rest.join(" ");
    return <div ref={(el) => registerRef(f.id, el)} style={{ ...style, fontSize: fontPx, lineHeight: 1, ...textStyle(f.options) }} className="flex items-center overflow-hidden whitespace-nowrap bg-paper/80 border border-dashed border-hairline rounded-[2px] pl-px text-ink">{text}</div>;
  }
  if (f.type === "formula") {
    return <div ref={(el) => registerRef(f.id, el)} title={tip ?? f.options?.formula} style={{ ...style, fontSize: fontPx, lineHeight: 1, ...textStyle(f.options) }} className="flex items-center overflow-hidden whitespace-nowrap bg-paper-2 border border-dashed border-hairline rounded-[2px] pl-px text-ink-2">{formulas[f.id] ?? ""}</div>;
  }
  if (f.type === "note") return <div ref={(el) => registerRef(f.id, el)} style={{ ...style, fontSize: fontPx, background: "#FFF8E1", border: "1px solid #E8D8A0", padding: 2, overflow: "hidden", whiteSpace: "pre-wrap", lineHeight: 1.15 }}>{f.value}</div>;
  if (f.type === "checkbox") {
    const on = v === "true";
    return (
      <button ref={(el) => registerRef(f.id, el)} type="button" data-field={f.id} onClick={() => onChange(f.id, on ? "false" : "true")} style={style} className={cn(base, "flex items-center justify-center bg-[#FCE3E5] border border-[#E58D97] rounded-[2px] hover:bg-rose-1/70 focus-ring")} aria-pressed={on} title={tip ?? (f.label || "Checkbox")}>
        {on ? <Check size={Math.max(8, size.width * f.width * 0.85)} strokeWidth={3} className="text-ink" /> : null}
      </button>
    );
  }
  if (f.type === "radio") {
    const on = v === "true";
    return (
      <button ref={(el) => registerRef(f.id, el)} type="button" data-field={f.id} onClick={() => onRadio(f.options?.group, f)} style={style} className={cn(base, "flex items-center justify-center bg-[#FCE3E5] border border-[#E58D97] rounded-full hover:bg-rose-1/70 focus-ring")} aria-pressed={on} title={tip ?? (f.options?.optionValue || f.label || "Option")}>
        {on ? <span className="w-1/2 h-1/2 rounded-full bg-ink" /> : null}
      </button>
    );
  }
  if (f.type === "dropdown") {
    return (
      <select ref={(el) => registerRef(f.id, el)} data-field={f.id} value={v} onChange={(e) => onChange(f.id, e.target.value)} title={tip} style={{ ...style, fontSize: fontPx, ...textStyle(f.options) }} className={cn(base, "bg-[#FCE3E5] border border-[#E58D97] rounded-[2px] text-ink px-0.5 focus-ring")}>
        <option value="">{f.label || "Select"}{f.required ? " *" : ""}</option>
        {(f.options?.choices ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
    );
  }
  if (f.type === "approve") {
    return <button ref={(el) => registerRef(f.id, el)} type="button" data-field={f.id} onClick={() => onApprove(f)} title={tip} style={{ ...style, fontSize: Math.max(9, Math.min(13, hPx * 0.5)) }} className={cn(base, "bg-ink text-white rounded-[4px] font-semibold uppercase tracking-wide hover:bg-[#2a2827] focus-ring")}>{f.label || "Approve"}</button>;
  }
  if (f.type === "decline") {
    return <button ref={(el) => registerRef(f.id, el)} type="button" data-field={f.id} onClick={() => onDecline(f)} title={tip} style={{ ...style, fontSize: Math.max(9, Math.min(13, hPx * 0.5)) }} className={cn(base, "bg-white text-ink border border-hairline rounded-[4px] font-semibold uppercase tracking-wide hover:bg-paper-2 focus-ring")}>{f.label || "Decline"}</button>;
  }
  if (f.type === "drawing") return <DrawingBox field={f} style={style} value={v} onChange={(png) => onChange(f.id, png)} registerRef={registerRef} missing={isMissing} />;
  if (f.type === "attachment") return <AttachmentBox field={f} style={style} value={v} token={token} fontPx={fontPx} onChange={(fid) => onChange(f.id, fid)} registerRef={registerRef} missing={isMissing} />;

  const inputType = f.type === "date" ? "date" : "text";
  return (
    <div style={style} className="group">
      <input
        ref={(el) => registerRef(f.id, el)}
        data-field={f.id}
        type={inputType}
        inputMode={f.type === "number" || f.options?.validation === "number" ? "decimal" : undefined}
        value={v}
        maxLength={f.options?.maxLength ?? 500}
        title={tip}
        placeholder={`${f.options?.placeholder || f.label || (f.type === "company" ? "Company" : f.type === "title" ? "Title" : f.type === "number" ? "Number" : "Text")}${f.required ? " *" : ""}`}
        onChange={(e) => onChange(f.id, e.target.value)}
        onBlur={() => onBlur(f)}
        style={{ fontSize: fontPx, ...textStyle(f.options) }}
        className={cn(base, "inset-0 w-full h-full bg-[#FCE3E5] border border-[#E58D97] rounded-[2px] px-0.5 text-ink placeholder:text-[#7A3440]/70 focus:bg-white focus-ring")}
      />
      {bad ? <div className="absolute left-0 top-full mt-0.5 z-10 whitespace-nowrap rounded bg-bad text-white text-[10px] px-1.5 py-0.5 shadow">{bad}</div> : null}
    </div>
  );
}

function DrawingBox({ field: f, style, value, onChange, registerRef, missing }: { field: SignerField; style: React.CSSProperties; value: string; onChange: (png: string) => void; registerRef: (id: string, el: HTMLElement | null) => void; missing: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const dirty = useRef(false);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.max(1, Math.round(r.width * dpr));
    c.height = Math.max(1, Math.round(r.height * dpr));
    const ctx = c.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 1.8; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#141414";
    if (value && value.startsWith("data:image")) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0, r.width, r.height); img.src = value; }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const pos = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] as const; };
  return (
    <div ref={(el) => registerRef(f.id, el)} data-field={f.id} style={style} className={cn("bg-[#FCE3E5]/60 border border-[#E58D97] rounded-[3px] overflow-hidden", missing && "ring-2 ring-bad/70")} title={f.options?.tooltip || f.label || "Draw here"}>
      <canvas
        ref={ref}
        className="w-full h-full touch-none cursor-crosshair"
        onPointerDown={(e) => { e.preventDefault(); (e.target as HTMLElement).setPointerCapture(e.pointerId); const ctx = ref.current!.getContext("2d")!; const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); setDrawing(true); }}
        onPointerMove={(e) => { if (!drawing) return; const ctx = ref.current!.getContext("2d")!; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); dirty.current = true; }}
        onPointerUp={() => { setDrawing(false); if (dirty.current) onChange(ref.current!.toDataURL("image/png")); }}
      />
      {!value ? <span className="absolute left-1 top-0.5 text-[10px] text-[#7A3440] font-semibold pointer-events-none">{f.label || "Draw"}{f.required ? " *" : ""}</span> : null}
      <button type="button" className="absolute right-1 bottom-0.5 text-[10px] text-rose-ink underline" onClick={() => { const c = ref.current!; const ctx = c.getContext("2d")!; ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height); ctx.restore(); dirty.current = false; onChange(""); }}>Clear</button>
    </div>
  );
}

function AttachmentBox({ field: f, style, value, token, fontPx, onChange, registerRef, missing }: { field: SignerField; style: React.CSSProperties; value: string; token: string; fontPx: number; onChange: (fileId: string) => void; registerRef: (id: string, el: HTMLElement | null) => void; missing: boolean }) {
  const [name, setName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  async function upload(file: File) {
    setBusy(true); setErr(null);
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("fieldId", f.id);
      const res = await fetch(`/api/s/${token}/attachments`, { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error?.message || "Upload failed");
      setName(j.filename); onChange(j.fileId);
    } catch (e) { setErr(e instanceof Error ? e.message : "Upload failed"); } finally { setBusy(false); }
  }
  const sz = Math.max(10, Math.min(14, fontPx * 1.2));
  return (
    <div style={{ ...style, overflow: "visible" }} className="group">
      <input ref={input} type="file" hidden accept={f.options?.accept || ".pdf,.png,.jpg,.jpeg"} onChange={(e) => { const file = e.target.files?.[0]; if (file) upload(file); e.target.value = ""; }} />
      {value ? (
        <span ref={(el) => registerRef(f.id, el)} className="absolute left-0 top-0 whitespace-nowrap inline-flex items-center gap-1 h-full max-h-6 rounded bg-white border border-hairline px-1.5 text-[11px] text-ink shadow-sm">
          <Paperclip size={11} /> {name || "Attached"} <button type="button" aria-label="Remove attachment" onClick={() => { setName(null); onChange(""); }} className="text-muted hover:text-bad"><X size={11} /></button>
        </span>
      ) : (
        <button ref={(el) => registerRef(f.id, el)} type="button" data-field={f.id} disabled={busy} onClick={() => input.current?.click()} title={f.options?.tooltip || f.label || "Attach a file"}
          className={cn("absolute left-0 top-0 whitespace-nowrap inline-flex items-center gap-1 h-full rounded-[3px] bg-[#FCE3E5] border border-[#E58D97] px-1.5 text-[#7A3440] font-semibold hover:bg-rose-1/70 focus-ring", missing && "ring-2 ring-bad/70")} style={{ fontSize: sz }}>
          <Paperclip size={sz} /> {busy ? "Uploading..." : "Attach"}{f.required ? <span className="text-bad">*</span> : null}
        </button>
      )}
      {err ? <div className="absolute left-0 top-full mt-0.5 z-10 whitespace-nowrap rounded bg-bad text-white text-[10px] px-1.5 py-0.5">{err}</div> : null}
    </div>
  );
}
