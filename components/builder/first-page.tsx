"use client";
import { useEffect, useRef } from "react";
import { loadPdf } from "@/components/pdf/pdf-document";

/** Renders page 1 of a PDF as a small thumbnail. */
export function FirstPageThumb({ url, width = 140 }: { url: string; width?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    loadPdf(url).then(async (doc) => {
      const page = await doc.getPage(1);
      if (cancelled || !ref.current) return;
      const base = page.getViewport({ scale: 1 });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const vp = page.getViewport({ scale: (width / base.width) * dpr });
      const c = ref.current;
      c.width = Math.floor(vp.width);
      c.height = Math.floor(vp.height);
      c.style.width = `${width}px`;
      c.style.height = `${Math.round((vp.height / vp.width) * width)}px`;
      const ctx = c.getContext("2d");
      if (ctx) await (page.render({ canvasContext: ctx, viewport: vp, canvas: c } as never) as unknown as { promise: Promise<void> }).promise.catch(() => {});
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [url, width]);
  return <canvas ref={ref} className="bg-white shadow-sm" style={{ width }} />;
}
