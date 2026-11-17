"use client";
/**
 * Renders PDF pages with pdf.js and lets callers overlay absolutely positioned
 * content per page using normalized coordinates (0..1, top-left origin).
 *
 *   <PdfDocument url="/api/files/<id>" renderOverlay={(pageIndex, size) => ...} />
 */
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;
export function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((m) => {
      m.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return m;
    });
  }
  return pdfjsPromise;
}

const docCache = new Map<string, Promise<PDFDocumentProxy>>();
export function loadPdf(url: string): Promise<PDFDocumentProxy> {
  if (!docCache.has(url)) {
    docCache.set(url, loadPdfjs().then((pdfjs) => pdfjs.getDocument({ url, withCredentials: true }).promise));
  }
  return docCache.get(url)!;
}

export interface PageSize { width: number; height: number }

export function PdfDocument({
  url,
  pageCount,
  maxWidth = 900,
  gap = 16,
  renderOverlay,
  onPageClick,
  pageClassName,
  pageRefs,
  label,
}: {
  url: string;
  pageCount?: number;
  maxWidth?: number;
  gap?: number;
  renderOverlay?: (pageIndex: number, size: PageSize) => React.ReactNode;
  onPageClick?: (pageIndex: number, xy: { x: number; y: number }, e: React.MouseEvent) => void;
  pageClassName?: string;
  pageRefs?: React.MutableRefObject<(HTMLDivElement | null)[]>;
  label?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState(0);
  const [ratios, setRatios] = useState<number[]>([]);

  useEffect(() => {
    let alive = true;
    loadPdf(url).then(async (d) => {
      if (!alive) return;
      const rs: number[] = [];
      for (let i = 1; i <= d.numPages; i++) {
        const p = await d.getPage(i);
        const vp = p.getViewport({ scale: 1 });
        rs.push(vp.height / vp.width);
      }
      if (!alive) return;
      setRatios(rs);
      setDoc(d);
    }).catch((e) => alive && setError(e?.message || "Could not load document"));
    return () => { alive = false; };
  }, [url]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.min(maxWidth, el.clientWidth)));
    ro.observe(el);
    setWidth(Math.min(maxWidth, el.clientWidth));
    return () => ro.disconnect();
  }, [maxWidth]);

  const n = doc?.numPages ?? pageCount ?? 0;
  return (
    <div ref={wrap} className="w-full flex flex-col items-center" style={{ gap }} aria-label={label}>
      {error ? <div className="text-sm text-bad py-10">{error}</div> : null}
      {!doc && !error ? <div className="text-sm text-muted py-16">Loading document...</div> : null}
      {doc && width > 0
        ? Array.from({ length: n }, (_, i) => {
            const h = Math.round(width * (ratios[i] ?? 1.294));
            return (
              <div
                key={i}
                ref={(el) => { if (pageRefs) pageRefs.current[i] = el; }}
                data-page={i}
                className={"relative bg-white shadow-[0_1px_3px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.04)] " + (pageClassName ?? "")}
                style={{ width, height: h }}
                onClick={(e) => {
                  if (!onPageClick) return;
                  const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                  onPageClick(i, { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }, e);
                }}
              >
                <PdfCanvas doc={doc} pageIndex={i} width={width} height={h} />
                {renderOverlay ? <div className="absolute inset-0">{renderOverlay(i, { width, height: h })}</div> : null}
              </div>
            );
          })
        : null}
    </div>
  );
}

function PdfCanvas({ doc, pageIndex, width, height }: { doc: PDFDocumentProxy; pageIndex: number; width: number; height: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(pageIndex < 2);
  useEffect(() => {
    const el = ref.current?.parentElement;
    if (!el || visible) return;
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) setVisible(true); }, { rootMargin: "800px" });
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null;
    (async () => {
      const page = await doc.getPage(pageIndex + 1);
      if (cancelled || !ref.current) return;
      const base = page.getViewport({ scale: 1 });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const vp = page.getViewport({ scale: (width / base.width) * dpr });
      const canvas = ref.current;
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      task = page.render({ canvasContext: ctx, viewport: vp, canvas } as never) as unknown as { cancel: () => void; promise: Promise<unknown> };
      await task.promise.catch(() => {});
    })();
    return () => { cancelled = true; task?.cancel(); };
  }, [doc, pageIndex, width, visible]);
  return <canvas ref={ref} style={{ width, height, display: "block" }} />;
}

export function PdfThumbnails({ url, onSelect, active }: { url: string; onSelect?: (i: number) => void; active?: number }) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  useEffect(() => { loadPdf(url).then(setDoc).catch(() => {}); }, [url]);
  if (!doc) return null;
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: doc.numPages }, (_, i) => (
        <button key={i} onClick={() => onSelect?.(i)} className={"relative border " + (active === i ? "border-ink" : "border-hairline")}>
          <PdfCanvas doc={doc} pageIndex={i} width={110} height={142} />
          <span className="absolute bottom-1 right-1 text-[10px] bg-white/90 px-1 rounded">{i + 1}</span>
        </button>
      ))}
    </div>
  );
}
