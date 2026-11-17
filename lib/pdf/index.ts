/**
 * PDF engine. Implements the contract in ./types.ts.
 * Server only, Node runtime. Pure functions over bytes.
 */
import { createHash } from "node:crypto";
import {
  PDFDocument, PDFFont, PDFPage, PDFImage, StandardFonts, rgb, degrees,
} from "pdf-lib";
import { SignPdf } from "@signpdf/signpdf";
import { P12Signer } from "@signpdf/signer-p12";
import { pdflibAddPlaceholder } from "@signpdf/placeholder-pdf-lib";
import { LOGO_PATHS, LOGO_VIEWBOX } from "./logo";
import { brand, appHost } from "../brand";
import type {
  AnchorHit, CertificateData, PdfInfo, RenderField, RenderInput, RenderOutput, Rotation, SealOptions,
} from "./types";

export * from "./types";

export const MAX_PDF_BYTES = 25 * 1024 * 1024;

export class PdfError extends Error {
  code: "encrypted" | "invalid" | "too_large" | "unsupported";
  constructor(code: PdfError["code"], message?: string) {
    super(message ?? code);
    this.name = "PdfError";
    this.code = code;
  }
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

// ---------------------------------------------------------------- loading

async function load(bytes: Uint8Array): Promise<PDFDocument> {
  if (bytes.byteLength > MAX_PDF_BYTES) throw new PdfError("too_large", `PDF is over ${MAX_PDF_BYTES / 1024 / 1024} MB`);
  const head = Buffer.from(bytes.subarray(0, 1024)).toString("latin1");
  if (!head.includes("%PDF-")) throw new PdfError("invalid", "Not a PDF file");
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  } catch (e) {
    throw new PdfError("invalid", `Could not read PDF: ${(e as Error).message}`);
  }
  if (doc.isEncrypted) throw new PdfError("encrypted", "This PDF is password protected or encrypted. Remove the protection and upload it again.");
  return doc;
}

function rotationOf(page: PDFPage): Rotation {
  const a = ((page.getRotation().angle % 360) + 360) % 360;
  return (a === 90 || a === 180 || a === 270 ? a : 0) as Rotation;
}

/** Visible box of the page (CropBox, falling back to MediaBox). */
function boxOf(page: PDFPage) {
  const c = page.getCropBox();
  return { x: c.x, y: c.y, width: c.width, height: c.height };
}

function displayedSize(page: PDFPage) {
  const b = boxOf(page);
  const r = rotationOf(page);
  return r === 90 || r === 270 ? { width: b.height, height: b.width } : { width: b.width, height: b.height };
}

export async function getPdfInfo(bytes: Uint8Array): Promise<PdfInfo> {
  let encrypted = false;
  let doc: PDFDocument;
  try {
    doc = await load(bytes);
  } catch (e) {
    if (e instanceof PdfError && e.code === "encrypted") {
      encrypted = true;
      doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    } else throw e;
  }
  let hasAcroForm = false;
  try { hasAcroForm = doc.getForm().getFields().length > 0; } catch { hasAcroForm = false; }
  const pages = doc.getPages().map((p, index) => {
    const s = displayedSize(p);
    return { index, width: round(s.width), height: round(s.height), rotation: rotationOf(p) };
  });
  return { pageCount: pages.length, pages, encrypted, hasAcroForm };
}

/** Flatten AcroForm fields (so uploaded form fields can't change after signing) and re-save. */
export async function normalizePdf(bytes: Uint8Array): Promise<Uint8Array> {
  const doc = await load(bytes);
  if (doc.getPageCount() === 0) throw new PdfError("invalid", "PDF has no pages");
  try {
    const form = doc.getForm();
    if (form.getFields().length) {
      try { form.updateFieldAppearances(); } catch { /* some fonts can't regenerate, keep existing appearances */ }
      form.flatten();
    }
  } catch (e) {
    throw new PdfError("unsupported", `Could not flatten form fields: ${(e as Error).message}`);
  }
  return doc.save({ useObjectStreams: false });
}

// ---------------------------------------------------------------- anchors

let pdfjsPromise: Promise<typeof import("pdfjs-dist/legacy/build/pdf.mjs")> | null = null;
/** pdf.js in Node: run the worker in-process (no worker thread / workerSrc needed on Vercel). */
function loadPdfjs() {
  pdfjsPromise ??= (async () => {
    const g = globalThis as unknown as { pdfjsWorker?: unknown };
    if (!g.pdfjsWorker) g.pdfjsWorker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
    return import("pdfjs-dist/legacy/build/pdf.mjs");
  })();
  return pdfjsPromise;
}

/**
 * Find every occurrence of each anchor string. Returns normalized top-left boxes on the displayed page.
 * Uses pdf.js text extraction (handles text split across runs within a line).
 */
export async function findAnchors(bytes: Uint8Array, anchors: string[]): Promise<AnchorHit[]> {
  if (!anchors.length) return [];
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({
    data: new Uint8Array(bytes), // pdf.js detaches the buffer
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  });
  const doc = await task.promise;
  const hits: AnchorHit[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const vp = page.getViewport({ scale: 1 }); // includes /Rotate and CropBox
      const tc = await page.getTextContent();
      type Run = { str: string; x: number; y: number; w: number; h: number };
      const runs: Run[] = [];
      for (const it of tc.items as Array<{ str?: string; transform?: number[]; width?: number; height?: number }>) {
        if (!it.str || !it.transform) continue;
        const [a, b, , , e, f] = it.transform;
        const fontH = Math.hypot(a, b) || it.height || 10;
        // Rect in PDF space: baseline at (e,f), extend up by font height.
        const p1 = vp.convertToViewportPoint(e, f);
        const p2 = vp.convertToViewportPoint(e + (it.width ?? 0), f + fontH);
        const x = Math.min(p1[0], p2[0]), y = Math.min(p1[1], p2[1]);
        runs.push({ str: it.str, x, y, w: Math.abs(p2[0] - p1[0]), h: Math.abs(p2[1] - p1[1]) });
      }
      // Group runs into lines (same rounded top), then search the concatenated line text.
      const lines = new Map<number, Run[]>();
      for (const r of runs) {
        const key = Math.round(r.y / 3);
        const arr = lines.get(key) ?? lines.get(key - 1) ?? lines.get(key + 1);
        if (arr) arr.push(r); else lines.set(key, [r]);
      }
      for (const lineRuns of lines.values()) {
        lineRuns.sort((a, b) => a.x - b.x);
        let text = "";
        const map: { run: Run; start: number }[] = [];
        for (const r of lineRuns) { map.push({ run: r, start: text.length }); text += r.str; }
        for (const anchor of anchors) {
          if (!anchor) continue;
          let from = 0;
          for (;;) {
            const idx = text.indexOf(anchor, from);
            if (idx < 0) break;
            from = idx + anchor.length;
            // locate start/end runs and interpolate character positions inside them
            const pos = (ci: number) => {
              let m = map[0];
              for (const mm of map) if (mm.start <= ci) m = mm;
              const frac = m.run.str.length ? (ci - m.start) / m.run.str.length : 0;
              return { x: m.run.x + m.run.w * Math.min(1, Math.max(0, frac)), run: m.run };
            };
            const s = pos(idx), e = pos(idx + anchor.length);
            const top = Math.min(s.run.y, e.run.y), bottom = Math.max(s.run.y + s.run.h, e.run.y + e.run.h);
            hits.push({
              anchor, page: p - 1,
              x: clamp01(s.x / vp.width), y: clamp01(top / vp.height),
              width: clamp01((e.x - s.x) / vp.width), height: clamp01((bottom - top) / vp.height),
            });
          }
        }
      }
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  return hits;
}

// ---------------------------------------------------------------- render

const C = {
  paper: rgb(0xf4 / 255, 0xf1 / 255, 0xef / 255),
  ink: rgb(0x14 / 255, 0x14 / 255, 0x14 / 255),
  mute: rgb(0x6e / 255, 0x6a / 255, 0x68 / 255),
  rule: rgb(0xd9 / 255, 0xd3 / 255, 0xd0 / 255),
  blush: rgb(0xf3 / 255, 0xd7 / 255, 0xd5 / 255),
  rose: rgb(0xf6 / 255, 0xa1 / 255, 0xa8 / 255),
  roseInk: rgb(0x95 / 255, 0x5c / 255, 0x67 / 255),
  white: rgb(1, 1, 1),
  stamp: rgb(0x77 / 255, 0x70 / 255, 0x6d / 255),
  band: rgb(0xf7 / 255, 0xe4 / 255, 0xe2 / 255),
};

interface Fonts { sans: PDFFont; bold: PDFFont; serif: PDFFont; mono: PDFFont; sansItalic: PDFFont; sansBoldItalic: PDFFont; serifBold: PDFFont; serifItalic: PDFFont; serifBoldItalic: PDFFont; monoBold: PDFFont; monoItalic: PDFFont; monoBoldItalic: PDFFont }

/** WinAnsi-safe text: replace characters Helvetica can't encode instead of throwing. */
function safe(font: PDFFont, s: string): string {
  const MAP: Record<string, string> = { "\u2014": "-", "\u2013": "-", "\u2018": "'", "\u2019": "'", "\u201C": '"', "\u201D": '"', "\u2026": "...", "\u00A0": " " };
  let out = "";
  for (const raw of String(s ?? "").normalize("NFKC")) {
    const ch = MAP[raw] ?? raw;
    if (ch === "\n" || ch === "\r" || ch === "\t") { out += " "; continue; }
    try { font.encodeText(ch); out += ch; } catch { out += "?"; }
  }
  return out;
}

function fitSize(font: PDFFont, text: string, boxW: number, boxH: number, max = 11, min = 5): number {
  let size = Math.min(max, boxH * 0.72);
  while (size > min && font.widthOfTextAtSize(text, size) > boxW - 2) size -= 0.25;
  return Math.max(min, size);
}

function wrap(font: PDFFont, text: string, size: number, maxW: number): string[] {
  const out: string[] = [];
  for (const para of String(text ?? "").split(/\n/)) {
    const words = safe(font, para).split(/\s+/).filter(Boolean);
    let cur = "";
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(t, size) <= maxW) { cur = t; continue; }
      if (cur) out.push(cur);
      // hard-break very long tokens (hashes, URLs)
      let rest = w;
      while (font.widthOfTextAtSize(rest, size) > maxW) {
        let n = rest.length;
        while (n > 1 && font.widthOfTextAtSize(rest.slice(0, n), size) > maxW) n--;
        out.push(rest.slice(0, n)); rest = rest.slice(n);
      }
      cur = rest;
    }
    out.push(cur);
  }
  return out;
}

const round = (n: number) => Math.round(n * 100) / 100;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function fmt(iso: string | null | undefined, tz: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(+d)) return iso;
  const date = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "numeric", day: "numeric" }).format(d);
  const time = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(d);
  return `${date} | ${time}`;
}

/**
 * Map a normalized displayed-page box (top-left origin) to unrotated PDF user space.
 * Returns the lower-left corner + size in user space and the rotation to apply to drawn content
 * so it reads upright on the displayed page.
 */
function toUserSpace(page: PDFPage, f: { x: number; y: number; width: number; height: number }) {
  const b = boxOf(page);
  const r = rotationOf(page);
  const disp = displayedSize(page);
  const dx = f.x * disp.width, dy = f.y * disp.height, dw = f.width * disp.width, dh = f.height * disp.height;
  // (u,v) = displayed coords with origin top-left. Convert box corners to user space.
  const toUser = (u: number, v: number): [number, number] => {
    switch (r) {
      case 90: return [b.x + v, b.y + u];
      case 180: return [b.x + b.width - u, b.y + v];
      case 270: return [b.x + b.width - v, b.y + b.height - u];
      default: return [b.x + u, b.y + b.height - v];
    }
  };
  // Displayed bottom-left corner of the box is where upright content starts.
  const [ox, oy] = toUser(dx, dy + dh);
  return { ox, oy, w: dw, h: dh, rotate: degrees(r) };
}

/** Rotate a local offset (along the displayed axes) into user space for the page rotation. */
function offset(r: number, along: number, up: number): [number, number] {
  switch (r) {
    case 90: return [-up, along];
    case 180: return [-along, -up];
    case 270: return [up, -along];
    default: return [along, up];
  }
}

const STAMP = rgb(0.36, 0.34, 0.33);

/** Short form of a signature id the way the stamp shows it: first 15 hex chars + "...". */
export function shortSignatureId(id: string | null | undefined): string {
  if (!id) return "";
  return id.replace(/-/g, "").toUpperCase().slice(0, 15) + "...";
}

/**
 * DocuSign-style signature stamp inside a field box: a thin left bracket with rounded corners spanning the box,
 * a small label on top (brand.stampLabel, "Imagine Signed by:" by default), the signature image in the middle and the short signature id at the bottom.
 * Coordinates are local to the displayed box (along = x from left, up = y from bottom) via the at() helper.
 */
function drawSignatureStamp(
  page: PDFPage,
  img: PDFImage,
  font: PDFFont,
  o: { w: number; h: number; rotate: ReturnType<typeof degrees>; at: (along: number, up: number) => { x: number; y: number }; label: string; id: string | null; small?: boolean },
) {
  const { w, h, at, rotate } = o;
  const text = Math.max(4.2, Math.min(7, h * (o.small ? 0.2 : 0.16)));
  const tick = Math.min(o.small ? 5 : 9, w * 0.12);
  const lw = Math.max(0.45, Math.min(0.8, h * 0.014));
  const rad = Math.min(2.6, h * 0.08);
  // bracket: top tick, rounded corner, vertical, rounded corner, bottom tick (drawn as short segments so rotation stays exact)
  const seg = (a: [number, number], b: [number, number]) => page.drawLine({ start: at(a[0], a[1]), end: at(b[0], b[1]), thickness: lw, color: STAMP });
  seg([tick, h], [rad, h]);
  seg([rad, h], [rad * 0.3, h - rad * 0.3]);
  seg([rad * 0.3, h - rad * 0.3], [0, h - rad]);
  seg([0, h - rad], [0, rad]);
  seg([0, rad], [rad * 0.3, rad * 0.3]);
  seg([rad * 0.3, rad * 0.3], [rad, 0]);
  seg([rad, 0], [tick, 0]);
  const pad = Math.max(2, text * 0.5);
  // Tiny initials boxes (< ~42pt wide): skip the "IS" label so it doesn't collide with the initials image.
  const showLabel = !(o.small && w < 42);
  const label = safe(font, o.label);
  if (showLabel) page.drawText(label, { ...at(pad, h - text * 1.05), size: text, font, color: STAMP, rotate });
  const id = o.id ? safe(font, o.id) : "";
  if (id) page.drawText(id, { ...at(pad, text * 0.35), size: text, font, color: STAMP, rotate });
  const top = showLabel ? h - text * 1.35 : h - 1;
  const bottom = id ? text * 1.45 : text * 0.4;
  const availH = Math.max(1, top - bottom);
  const availW = Math.max(1, w - pad - 1);
  const s = Math.min(availW / img.width, availH / img.height);
  const iw = img.width * s, ih = img.height * s;
  page.drawImage(img, { ...at(pad, bottom + (availH - ih) / 2), width: iw, height: ih, rotate });
}

function pickFont(fonts: Fonts, fmt: RenderField["format"]): PDFFont {
  const fam = fmt?.font ?? "helvetica", b = !!fmt?.bold, i = !!fmt?.italic;
  if (fam === "times") return b && i ? fonts.serifBoldItalic : b ? fonts.serifBold : i ? fonts.serifItalic : fonts.serif;
  if (fam === "courier") return b && i ? fonts.monoBoldItalic : b ? fonts.monoBold : i ? fonts.monoItalic : fonts.mono;
  return b && i ? fonts.sansBoldItalic : b ? fonts.bold : i ? fonts.sansItalic : fonts.sans;
}

function hexColor(hex: string | undefined | null) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return C.ink;
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

async function drawField(doc: PDFDocument, page: PDFPage, f: RenderField, fonts: Fonts, imgs: Map<Uint8Array, PDFImage>) {
  if (f.type === "note") return;
  const r = rotationOf(page);
  const { ox, oy, w, h, rotate } = toUserSpace(page, f);
  const at = (along: number, up: number) => { const [ax, ay] = offset(r, along, up); return { x: ox + ax, y: oy + ay }; };

  if (f.type === "signature" || f.type === "initials") {
    if (!f.imagePng || !f.imagePng.byteLength) return;
    let img = imgs.get(f.imagePng);
    if (!img) { img = await doc.embedPng(f.imagePng); imgs.set(f.imagePng, img); }
    if (f.stamp) {
      drawSignatureStamp(page, img, fonts.sans, { w, h, rotate, at, label: f.stamp.label, id: f.stamp.id ?? null, small: f.type === "initials" });
      return;
    }
    const s = Math.min(w / img.width, h / img.height);
    const iw = img.width * s, ih = img.height * s;
    page.drawImage(img, { ...at(0, (h - ih) / 2), width: iw, height: ih, rotate });
    return;
  }

  if (f.type === "stamp" || f.type === "drawing") {
    if (!f.imagePng || !f.imagePng.byteLength) return;
    let img = imgs.get(f.imagePng);
    if (!img) { img = await doc.embedPng(f.imagePng); imgs.set(f.imagePng, img); }
    const s = Math.min(w / img.width, h / img.height);
    const iw = img.width * s, ih = img.height * s;
    page.drawImage(img, { ...at(0, (h - ih) / 2), width: iw, height: ih, rotate });
    return;
  }

  if (f.type === "checkbox" || f.type === "radio") {
    const checked = f.type === "checkbox" ? f.value === "true" : f.value != null && f.value === f.optionValue;
    if (!checked && f.type === "radio") return;
    const s = Math.min(w, h);
    const t = Math.max(0.8, s * 0.12);
    if (f.type === "checkbox") {
      const o = at(0, 0);
      page.drawRectangle({ x: o.x, y: o.y, width: s, height: s, borderColor: C.ink, borderWidth: Math.max(0.5, s * 0.06), rotate });
      const a = at(s * 0.18, s * 0.52), b = at(s * 0.42, s * 0.22), c = at(s * 0.84, s * 0.8);
      if (checked) {
        page.drawLine({ start: a, end: b, thickness: t, color: C.ink });
        page.drawLine({ start: b, end: c, thickness: t, color: C.ink });
      }
    } else {
      page.drawCircle({ ...at(s / 2, s / 2), size: s * 0.28, color: C.ink });
    }
    return;
  }

  if (f.value == null || f.value === "") return;
  const font = pickFont(fonts, f.format);
  const color = f.format?.color ? hexColor(f.format.color) : C.ink;
  const text = safe(font, f.value);
  const size = f.fontSize ?? fitSize(font, text, w, h);
  // Single line, vertically centered, auto-fit (max 11pt, min 5pt), clipped to the box width.
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(t, size) > w - 1) t = t.slice(0, -1);
  const baseUp = (h - size) / 2 + size * 0.22;
  page.drawText(t, { ...at(1, baseUp), size, font, color, rotate });
  if (f.format?.underline) {
    const tw = font.widthOfTextAtSize(t, size);
    page.drawLine({ start: at(1, baseUp - size * 0.12), end: at(1 + tw, baseUp - size * 0.12), thickness: Math.max(0.4, size * 0.06), color });
  }
}

function stamp(page: PDFPage, envelopeId: string, font: PDFFont) {
  const r = rotationOf(page);
  const disp = displayedSize(page);
  const label = `${brand.name} Envelope ID: ${envelopeId}`;
  const size = 7;
  // top-left margin of the displayed page
  const { ox, oy, rotate } = toUserSpace(page, { x: 18 / disp.width, y: 8 / disp.height, width: 0.6, height: 10 / disp.height });
  const [ax, ay] = offset(r, 0, 2);
  page.drawText(safe(font, label), { x: ox + ax, y: oy + ay, size, font, color: C.stamp, rotate });
}

async function embedFonts(doc: PDFDocument): Promise<Fonts> {
  const [sans, bold, serif, mono, sansItalic, sansBoldItalic, serifBold, serifItalic, serifBoldItalic, monoBold, monoItalic, monoBoldItalic] = await Promise.all([
    doc.embedFont(StandardFonts.Helvetica),
    doc.embedFont(StandardFonts.HelveticaBold),
    doc.embedFont(StandardFonts.TimesRoman),
    doc.embedFont(StandardFonts.Courier),
    doc.embedFont(StandardFonts.HelveticaOblique),
    doc.embedFont(StandardFonts.HelveticaBoldOblique),
    doc.embedFont(StandardFonts.TimesRomanBold),
    doc.embedFont(StandardFonts.TimesRomanItalic),
    doc.embedFont(StandardFonts.TimesRomanBoldItalic),
    doc.embedFont(StandardFonts.CourierBold),
    doc.embedFont(StandardFonts.CourierOblique),
    doc.embedFont(StandardFonts.CourierBoldOblique),
  ]);
  return { sans, bold, serif, mono, sansItalic, sansBoldItalic, serifBold, serifItalic, serifBoldItalic, monoBold, monoItalic, monoBoldItalic };
}

export async function renderCompleted(input: RenderInput): Promise<RenderOutput> {
  if (!input.documents.length) throw new PdfError("invalid", "Envelope has no documents");
  const out = await PDFDocument.create();
  const fonts = await embedFonts(out);
  const offsets: number[] = [];
  for (const d of input.documents) {
    const src = await load(d.bytes);
    try { const form = src.getForm(); if (form.getFields().length) form.flatten(); } catch { /* none */ }
    offsets.push(out.getPageCount());
    const copied = await out.copyPages(src, src.getPageIndices());
    for (const p of copied) out.addPage(p);
  }
  const pages = out.getPages();
  const imgs = new Map<Uint8Array, PDFImage>();
  for (const f of input.fields) {
    const page = pages[(offsets[f.documentIndex] ?? -1) + f.page];
    if (offsets[f.documentIndex] === undefined || !page) {
      throw new PdfError("invalid", `Field ${f.id} points at a missing page (document ${f.documentIndex}, page ${f.page})`);
    }
    await drawField(out, page, f, fonts, imgs);
  }
  if (input.stampEnvelopeId) for (const p of pages) stamp(p, input.envelopeId, fonts.sans);

  for (const a of input.attachments ?? []) {
    try {
      if (a.contentType === "application/pdf" || a.name.toLowerCase().endsWith(".pdf")) {
        const src = await load(a.bytes);
        const copied = await out.copyPages(src, src.getPageIndices());
        for (const pg of copied) { out.addPage(pg); if (input.stampEnvelopeId) stamp(pg, input.envelopeId, fonts.sans); }
      } else if (/png|jpe?g/i.test(a.contentType) || /\.(png|jpe?g)$/i.test(a.name)) {
        const img = /png/i.test(a.contentType) || /\.png$/i.test(a.name) ? await out.embedPng(a.bytes) : await out.embedJpg(a.bytes);
        const pg = out.addPage([612, 792]);
        const maxW = 612 - 80, maxH = 792 - 120;
        const sc = Math.min(maxW / img.width, maxH / img.height, 1);
        pg.drawText(safe(fonts.sans, `Attachment: ${a.name}`), { x: 40, y: 792 - 50, size: 9, font: fonts.sans, color: C.mute });
        pg.drawImage(img, { x: 40, y: 792 - 70 - img.height * sc, width: img.width * sc, height: img.height * sc });
        if (input.stampEnvelopeId) stamp(pg, input.envelopeId, fonts.sans);
      } else {
        const pg = out.addPage([612, 792]);
        pg.drawText(safe(fonts.sans, `Attachment (not rendered): ${a.name}`), { x: 40, y: 792 - 50, size: 10, font: fonts.sans, color: C.ink });
      }
    } catch {
      const pg = out.addPage([612, 792]);
      pg.drawText(safe(fonts.sans, `Attachment could not be rendered: ${a.name}`), { x: 40, y: 792 - 50, size: 10, font: fonts.sans, color: C.ink });
    }
  }

  const certificatePageCount = await appendCertificate(out, input.certificate, fonts, { stamped: input.stampEnvelopeId });
  setMeta(out, input.certificate);
  const combined = await out.save({ useObjectStreams: false });

  // certificate alone
  const certDoc = await PDFDocument.create();
  const certFonts = await embedFonts(certDoc);
  await appendCertificate(certDoc, input.certificate, certFonts, { stamped: input.stampEnvelopeId });
  setMeta(certDoc, input.certificate, "Certificate of Completion - ");
  const certificate = await certDoc.save({ useObjectStreams: false });

  return { combined, certificate, certificatePageCount };
}

function setMeta(doc: PDFDocument, c: CertificateData, prefix = "") {
  doc.setTitle(prefix + c.subject);
  doc.setProducer(brand.name);
  doc.setCreator(appHost() ? `${brand.name} (${appHost()})` : brand.name);
  doc.setSubject(`Envelope ${c.envelopeId}`);
  doc.setKeywords([`envelope:${c.envelopeId}`, "imagine-sign"]);
}

// ---------------------------------------------------------------- certificate

async function appendCertificate(doc: PDFDocument, c: CertificateData, f: Fonts, opts: { stamped?: boolean } = {}): Promise<number> {
  const W = 612, H = 792, M = 40;
  const tz = c.timezone || "America/Los_Angeles";
  const tzAbbr = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" })
    .formatToParts(new Date(c.completedAt ?? c.createdAt)).find((p) => p.type === "timeZoneName")?.value ?? tz;
  const startIndex = doc.getPageCount();
  let page!: PDFPage;
  let y = 0;

  const COL = { a: M + 6, b: M + 200, c: M + 392 }; // three-column event tables
  const TXT = 7.6, LH = 10;

  const drawLogo = (x: number, yTop: number, height: number) => {
    const s = height / LOGO_VIEWBOX.height;
    if (!brand.isDefault) {
      // custom brand: draw the product name instead of the stock Imagine wordmark
      page.drawText(safe(f.serif, brand.name), { x: x + 7, y: yTop - height * 0.8, size: height * 0.75, font: f.serif, color: C.ink });
      return;
    }
    for (const d of LOGO_PATHS) page.drawSvgPath(d, { x, y: yTop, scale: s, color: C.ink });
  };

  const newPage = () => {
    page = doc.addPage([W, H]);
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: C.white });
    drawLogo(M - 7, H - 30, 22);
    const eid = `Envelope Id: ${c.envelopeId}`;
    page.drawText(safe(f.sans, eid), { x: W - M - f.sans.widthOfTextAtSize(eid, 7), y: H - 44, size: 7, font: f.sans, color: C.mute });
    page.drawLine({ start: { x: M, y: H - 56 }, end: { x: W - M, y: H - 56 }, thickness: 0.5, color: C.rule });
    page.drawLine({ start: { x: M, y: 34 }, end: { x: W - M, y: 34 }, thickness: 0.5, color: C.rule });
    page.drawText(safe(f.sans, appHost() ? `${brand.name}  |  ${appHost()}` : brand.name), { x: M, y: 22, size: 6.8, font: f.sans, color: C.mute });
    y = H - 74;
  };
  const need = (h: number) => { if (y - h < 44) newPage(); };

  const band = (title: string, cols?: [string, string, string]) => {
    need(46);
    page.drawRectangle({ x: M, y: y - 5, width: W - 2 * M, height: 17, color: C.band });
    if (cols) {
      page.drawText(safe(f.bold, cols[0]), { x: COL.a, y, size: 8, font: f.bold, color: C.ink });
      page.drawText(safe(f.bold, cols[1]), { x: COL.b, y, size: 8, font: f.bold, color: C.ink });
      page.drawText(safe(f.bold, cols[2]), { x: COL.c, y, size: 8, font: f.bold, color: C.ink });
    } else {
      page.drawText(safe(f.bold, title), { x: COL.a, y, size: 8, font: f.bold, color: C.ink });
    }
    y -= 18;
  };
  const rule = () => { page.drawLine({ start: { x: M, y: y + 4 }, end: { x: W - M, y: y + 4 }, thickness: 0.35, color: C.rule }); y -= 6; };

  /** Draw lines in a column starting at yTop; returns the y after the last line. */
  const col = (x: number, yTop: number, lines: { t: string; bold?: boolean; size?: number; color?: ReturnType<typeof rgb> }[], maxW: number) => {
    let yy = yTop;
    for (const ln of lines) {
      const font = ln.bold ? f.bold : f.sans;
      const size = ln.size ?? TXT;
      for (const w of wrap(font, ln.t, size, maxW)) {
        page.drawText(w, { x, y: yy, size, font, color: ln.color ?? C.ink });
        yy -= size + 2.4;
      }
    }
    return yy;
  };

  // ------------------------------------------------ page 1 header
  newPage();
  page.drawText("Certificate Of Completion", { x: M, y, size: 22, font: f.serif, color: C.ink });
  y -= 24;
  const statusLabel = c.status[0].toUpperCase() + c.status.slice(1);
  const top = y;
  const endL = col(M, top, [
    { t: `Envelope Id: ${c.envelopeId}`, size: 8 },
    { t: `Subject: ${c.subject}`, size: 8 },
  ], 330);
  const endR = col(M + 360, top, [{ t: `Status: ${statusLabel}`, size: 8, bold: true }], 170);
  y = Math.min(endL, endR) - 8;

  // Source envelope | Envelope originator
  const pages = c.documents.reduce((n, d) => n + d.pageCount, 0);
  const srcTop = y;
  const certPagesPlaceholderY: number[] = [];
  const srcLines = [
    { t: "Source Envelope:", bold: true },
    { t: `Document Pages: ${pages}` },
    { t: `Signatures: ${c.signatureCount}` },
    { t: `Initials: ${c.initialsCount}` },
    { t: "Certificate Pages: __CERT__" },
    { t: `Envelope Stamping: ${opts.stamped === false ? "Disabled" : "Enabled"}` },
    { t: `Time Zone: (${tzAbbr}) ${tz}` },
  ];
  // draw manually so we can patch the certificate page count once known
  let yy = srcTop;
  for (const ln of srcLines) {
    const font = ln.bold ? f.bold : f.sans;
    if (ln.t.includes("__CERT__")) { certPagesPlaceholderY.push(yy); page.drawText("Certificate Pages:", { x: M, y: yy, size: TXT, font, color: C.ink }); }
    else page.drawText(safe(font, ln.t), { x: M, y: yy, size: TXT, font, color: C.ink });
    yy -= TXT + 2.4;
  }
  const certCountPage = page;
  const origEnd = col(M + 360, srcTop, [
    { t: "Envelope Originator:", bold: true },
    { t: c.sender.name },
    ...(c.sender.company ? [{ t: c.sender.company }] : []),
    { t: c.sender.email },
    ...(c.sender.ip ? [{ t: `IP Address: ${c.sender.ip}` }] : []),
  ], 170);
  y = Math.min(yy, origEnd) - 10;

  // Record tracking
  band("", ["Record Tracking", "", ""]);
  {
    const t0 = y;
    const a = col(COL.a, t0, [{ t: "Status: Original" }, { t: fmt(c.createdAt, tz), color: C.mute }], 180);
    const b = col(COL.b, t0, [{ t: `Holder: ${c.sender.name}` }, { t: c.sender.email, color: C.mute }], 180);
    const cc = col(COL.c, t0, [{ t: `Location: ${brand.name}` }], 140);
    y = Math.min(a, b, cc) - 4;
    rule();
  }

  // Documents (hashes): keeps the record self-verifying
  band("", ["Documents", "Pages", "SHA-256"]);
  for (const d of c.documents) {
    need(24);
    const t0 = y;
    const a = col(COL.a, t0, [{ t: d.name }], 180);
    col(COL.b, t0, [{ t: String(d.pageCount) }], 60);
    const hex = col(M + 250, t0, [{ t: d.sha256, size: 6.6, color: C.mute }], W - M - 256);
    y = Math.min(a, hex) - 4;
    rule();
  }

  // ------------------------------------------------ recipient tables
  const sorted = [...c.recipients].sort((a, b) => a.routingOrder - b.routingOrder);
  const signerBlock = async (r: CertificateData["recipients"][number]) => {
    const img = r.signatureImagePng?.byteLength ? await doc.embedPng(r.signatureImagePng) : null;
    need(img ? 104 : 74);
    const t0 = y;
    const a = col(COL.a, t0, [
      { t: r.name, bold: true },
      { t: r.email },
      ...(r.role === "approver" ? [{ t: "Approver" }] : []),
      { t: `Security Level: ${r.securityLevel}`, color: C.mute },
      { t: `Routing Order: ${r.routingOrder}`, color: C.mute },
    ], 185);
    let by = t0;
    if (img && r.status === "completed") {
      const bw = 150, bh = 46;
      const ox = COL.b, oy = by - bh + 8;
      drawSignatureStamp(page, img, f.sans, { w: bw, h: bh, rotate: degrees(0), at: (a, u) => ({ x: ox + a, y: oy + u }), label: brand.stampLabel, id: r.signatureId ? shortSignatureId(r.signatureId) : null });
      by -= bh + 4;
    }
    const statusText = r.status === "completed" ? (r.role === "approver" ? "Approved" : img ? "" : "Completed")
      : r.status === "declined" ? "Declined" : r.status === "replaced" ? "Reassigned" : r.status === "delivered" ? "Viewed, not signed" : r.status === "sent" ? "Sent, not signed" : "Not sent";
    const b = col(COL.b, by, [
      ...(statusText ? [{ t: statusText, bold: r.status === "declined" }] : []),
      ...(r.signatureAdoption && r.status === "completed" ? [{ t: `Signature Adoption: ${r.signatureAdoption}`, color: C.mute }] : []),
      ...(r.signatureId && r.status === "completed" ? [{ t: `Signature ID: ${r.signatureId}`, color: C.mute }] : []),
      ...(r.ip ? [{ t: `Using IP Address: ${r.ip}`, color: C.mute }] : []),
      ...(r.location ? [{ t: r.location, color: C.mute }] : []),
      ...(r.userAgent ? [{ t: `Device: ${r.userAgent}`, size: 6.4, color: C.mute }] : []),
      ...(r.declineReason ? [{ t: `Reason for declining: ${r.declineReason}` }] : []),
    ], 182);
    const ts: { t: string; color?: ReturnType<typeof rgb> }[] = [];
    if (r.sentAt) ts.push({ t: `Sent: ${fmt(r.sentAt, tz)}` });
    if (r.viewedAt) ts.push({ t: `Viewed: ${fmt(r.viewedAt, tz)}` });
    if (r.signedAt) ts.push({ t: `${r.role === "approver" ? "Approved" : "Signed"}: ${fmt(r.signedAt, tz)}` });
    if (r.declinedAt) ts.push({ t: `Declined: ${fmt(r.declinedAt, tz)}` });
    const cc = col(COL.c, t0, ts, W - M - COL.c);
    y = Math.min(a, b, cc) - 2;
    need(14);
    const consent = r.consent
      ? `Electronic Record and Signature Disclosure: Accepted: ${fmt(r.consent.acceptedAt, tz)}  ID: ${r.consent.id}`
      : `Electronic Record and Signature Disclosure: Not Offered via ${brand.name}`;
    y = col(COL.a, y, [{ t: consent, size: 6.8, color: C.mute }], W - 2 * M - 12) - 3;
    rule();
  };
  const simpleBlock = (r: CertificateData["recipients"][number], label: string) => {
    need(42);
    const t0 = y;
    const a = col(COL.a, t0, [{ t: r.name, bold: true }, { t: r.email }, { t: `Security Level: ${r.securityLevel}`, color: C.mute }], 185);
    const done = r.status === "completed";
    const b = col(COL.b, t0, [{ t: done ? label : r.status === "declined" ? "Declined" : "Pending" }], 182);
    const ts: { t: string }[] = [];
    if (r.sentAt) ts.push({ t: `Sent: ${fmt(r.sentAt, tz)}` });
    if (r.viewedAt) ts.push({ t: `Viewed: ${fmt(r.viewedAt, tz)}` });
    if (r.signedAt && r.role !== "cc") ts.push({ t: `Completed: ${fmt(r.signedAt, tz)}` });
    const cc = col(COL.c, t0, ts, W - M - COL.c);
    y = Math.min(a, b, cc) - 4;
    rule();
  };

  band("", ["Signer Events", "Signature", "Timestamp"]);
  const signers = sorted.filter((r) => r.role === "signer" || r.role === "approver");
  if (!signers.length) { y = col(COL.a, y, [{ t: "No signers", color: C.mute }], 200) - 4; rule(); }
  for (const r of signers) await signerBlock(r);

  const viewers = sorted.filter((r) => r.role === "viewer");
  if (viewers.length) { band("", ["Certified Delivery Events", "Status", "Timestamp"]); for (const r of viewers) simpleBlock(r, "Viewed"); }
  band("", ["Carbon Copy Events", "Status", "Timestamp"]);
  const ccs = sorted.filter((r) => r.role === "cc");
  if (!ccs.length) { y = col(COL.a, y, [{ t: "No carbon copy recipients", color: C.mute }], 200) - 4; rule(); }
  for (const r of ccs) simpleBlock(r, "Copied");

  if (c.attachments?.length) {
    band("", ["Signer Attachments", "Attached by", "SHA-256"]);
    for (const a of c.attachments) {
      need(22);
      const t0 = y;
      const a1 = col(COL.a, t0, [{ t: a.name }], 185);
      const a2 = col(COL.b, t0, [{ t: a.recipient }], 182);
      const a3 = col(COL.c, t0, [{ t: a.sha256, size: 6.2, color: C.mute }], W - M - COL.c);
      y = Math.min(a1, a2, a3) - 4;
      rule();
    }
  }

  // ------------------------------------------------ summary events
  band("", ["Envelope Summary Events", "Status", "Timestamps"]);
  const firstViewed = signers.map((r) => r.viewedAt).filter(Boolean).sort().pop() ?? null;
  const lastSigned = signers.map((r) => r.signedAt).filter(Boolean).sort().pop() ?? null;
  const summary: [string, string, string | null | undefined][] = [
    ["Envelope Sent", "Hashed/Encrypted", c.sentAt],
    ["Certified Delivered", "Security Checked", c.status === "completed" ? firstViewed : null],
    ["Signing Complete", "Security Checked", c.status === "completed" ? lastSigned : null],
    ["Completed", "Security Checked", c.status === "completed" ? c.completedAt : null],
  ];
  if (c.status === "declined") {
    const d = sorted.find((r) => r.status === "declined");
    summary.push(["Envelope Declined", "Declined", d?.declinedAt ?? null]);
  }
  if (c.status === "voided") summary.push(["Envelope Voided", "Voided", c.completedAt ?? null]);
  for (const [k, st, at] of summary) {
    if (!at) continue;
    need(14);
    page.drawText(k, { x: COL.a, y, size: TXT, font: f.sans, color: C.ink });
    page.drawText(st, { x: COL.b, y, size: TXT, font: f.sans, color: C.ink });
    page.drawText(safe(f.sans, fmt(at, tz)), { x: COL.c, y, size: TXT, font: f.sans, color: C.ink });
    y -= LH + 2;
  }
  y -= 2; rule();

  // ------------------------------------------------ history
  if (c.events.length) {
    band("", ["Envelope History", "Actor", "Event"]);
    for (const e of c.events) {
      const desc = wrap(f.sans, e.description, 7, W - M - COL.c);
      need(9 * desc.length + 4);
      page.drawText(safe(f.sans, fmt(e.at, tz)), { x: COL.a, y, size: 7, font: f.sans, color: C.mute });
      page.drawText(safe(f.sans, `${e.actor ?? ""}${e.ip ? `  (${e.ip})` : ""}`.slice(0, 48)), { x: COL.b, y, size: 7, font: f.sans, color: C.ink });
      desc.forEach((ln, i) => page.drawText(ln, { x: COL.c, y: y - i * 9, size: 7, font: f.sans, color: C.ink }));
      y -= 9 * desc.length + 3;
    }
    y -= 2; rule();
  }

  // ------------------------------------------------ disclosure
  band("Electronic Record and Signature Disclosure");
  const paras = (c.disclosureText || "").split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  for (const [i, para] of paras.entries()) {
    const font = i === 0 && para === para.toUpperCase() ? f.bold : f.sans;
    for (const ln of wrap(font, para, 7.2, W - 2 * M - 12)) { need(10); page.drawText(ln, { x: COL.a, y, size: 7.2, font, color: C.ink }); y -= 9.4; }
    y -= 4;
  }

  // ------------------------------------------------ page numbers + cert page count
  const all = doc.getPages();
  const added = all.length - startIndex;
  all.slice(startIndex).forEach((p, i) => {
    const label = `Page ${i + 1} of ${added}`;
    p.drawText(label, { x: W - M - f.sans.widthOfTextAtSize(label, 6.8), y: 22, size: 6.8, font: f.sans, color: C.mute });
  });
  for (const py of certPagesPlaceholderY) {
    certCountPage.drawText(String(added), { x: M + f.sans.widthOfTextAtSize("Certificate Pages: ", TXT), y: py, size: TXT, font: f.sans, color: C.ink });
  }
  return added;
}

// ---------------------------------------------------------------- seal

export async function sealPdf(bytes: Uint8Array, opts: SealOptions): Promise<Uint8Array> {
  const doc = await load(bytes);
  pdflibAddPlaceholder({
    pdfDoc: doc,
    reason: opts.reason,
    contactInfo: opts.contactInfo,
    name: opts.name,
    location: opts.location,
    signatureLength: 16384,
  });
  const withPlaceholder = await doc.save({ useObjectStreams: false });
  const signer = new P12Signer(Buffer.from(opts.p12), { passphrase: opts.passphrase });
  const signed = await new SignPdf().sign(Buffer.from(withPlaceholder), signer);
  return new Uint8Array(signed);
}

/** Load the seal from env (SEAL_P12_BASE64 / SEAL_P12_PASSPHRASE). Returns null when not configured. */
export function sealFromEnv(): SealOptions | null {
  const b64 = process.env.SEAL_P12_BASE64;
  if (!b64) return null;
  return {
    p12: new Uint8Array(Buffer.from(b64, "base64")),
    passphrase: process.env.SEAL_P12_PASSPHRASE ?? "",
    name: brand.company || brand.name,
    reason: `Signed and sealed by ${brand.name}`,
    location: process.env.SEAL_LOCATION ?? "",
    contactInfo: brand.supportEmail || process.env.EMAIL_FROM_ADDRESS || "",
  };
}

// ---------------------------------------------------------------- default disclosure

const DISCLOSURE_ORG = brand.company || "the organization that sent you this document";
const DISCLOSURE_SUPPORT = brand.supportEmail || process.env.EMAIL_FROM_ADDRESS || "";
const DISCLOSURE_CONTACT = DISCLOSURE_SUPPORT ? `email ${DISCLOSURE_SUPPORT}` : "contact the sender";

export const DEFAULT_DISCLOSURE = `ELECTRONIC RECORD AND SIGNATURE DISCLOSURE

From time to time, ${DISCLOSURE_ORG} ("we", "us" or "Company") may be required by law to provide to you certain written notices or disclosures. Described below are the terms and conditions for providing to you such notices and disclosures electronically through ${brand.name}. Please read the information below carefully and thoroughly, and if you can access this information electronically to your satisfaction and agree to this Electronic Record and Signature Disclosure, please confirm your agreement by selecting the check-box next to "I agree to use electronic records and signatures" before clicking "Continue" within ${brand.name}.

Getting paper copies: At any time, you may request from us a paper copy of any record provided or made available electronically to you by us. You will have the ability to download and print documents we send to you through ${brand.name} during and immediately after the signing session, and a completed copy is emailed to every party. To request a paper copy, ${DISCLOSURE_CONTACT}.

Withdrawing your consent: If you decide to receive notices and disclosures from us electronically, you may at any time change your mind and tell us that thereafter you want to receive required notices and disclosures only in paper format. To withdraw your consent, decline to sign the document in ${brand.name}, or ${DISCLOSURE_CONTACT} with "Withdraw consent" in the subject. Withdrawing consent only applies going forward and does not affect the legal effectiveness of records signed before withdrawal.

Required hardware and software: A current version of Chrome, Safari, Edge or Firefox on a computer, tablet or phone, an email account, and the ability to open PDF files. We will notify you if these requirements change.

Acknowledging your access and consent to receive and sign documents electronically: By selecting the check-box you confirm that you can access and read this disclosure, that you can print or electronically save this disclosure and the documents for your records, and that until or unless you notify us as described above, you consent to receive exclusively through electronic means all notices, disclosures, authorizations, acknowledgements, and other documents that are required to be provided or made available to you in the course of your relationship with ${DISCLOSURE_ORG}.`;
