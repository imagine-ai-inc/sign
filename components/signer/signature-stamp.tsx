"use client";
/** DocuSign-style signed stamp: left bracket with ticks, tiny label, image, short signature id. Sizes follow the box height like the PDF engine. */
export function shortSignatureId(id: string | null | undefined) {
  if (!id) return "";
  return id.replace(/-/g, "").toUpperCase().slice(0, 15) + "...";
}

export function SignatureStamp({ heightPx, widthPx, label, id, src, text, small }: { heightPx: number; widthPx: number; label: string; id?: string | null; src?: string | null; text?: string | null; small?: boolean }) {
  const t = Math.max(5, Math.min(11, heightPx * (small ? 0.2 : 0.16)));
  const tick = Math.min(small ? 5 : 9, widthPx * 0.12);
  const pad = Math.max(2, t * 0.5);
  const color = "#5C5755";
  return (
    <div className="absolute inset-0 pointer-events-none" style={{ color }}>
      <svg className="absolute inset-0 w-full h-full overflow-visible" viewBox={`0 0 ${widthPx} ${heightPx}`} preserveAspectRatio="none" aria-hidden>
        <path d={`M ${tick} 0.5 H 2.5 Q 0.5 0.5 0.5 2.5 V ${heightPx - 2.5} Q 0.5 ${heightPx - 0.5} 2.5 ${heightPx - 0.5} H ${tick}`} fill="none" stroke={color} strokeWidth={1} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {small ? (
        widthPx >= 56 ? <span className="absolute font-semibold leading-none" style={{ left: pad, top: 1, fontSize: t }}>{label}</span> : null
      ) : (
        <span className="absolute leading-none whitespace-nowrap" style={{ left: pad, top: 1, fontSize: t }}>{label}</span>
      )}
      <div className="absolute flex items-center" style={{ left: pad, right: 1, top: small && widthPx < 56 ? 2 : t * 1.35, bottom: id ? t * 1.45 : t * 0.4 }}>
        {src ? <img src={src} alt="" className="max-h-full max-w-full object-contain object-left" /> : text ? <span className="italic truncate" style={{ fontSize: Math.max(8, heightPx * 0.22) }}>{text}</span> : null}
      </div>
      {id ? <span className="absolute font-mono leading-none whitespace-nowrap" style={{ left: pad, bottom: 1, fontSize: Math.max(5, Math.min(8, t)) }}>{id}</span> : null}
    </div>
  );
}
