import { describe, it, expect, beforeAll } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync, crc32 } from "node:zlib";
import forge from "node-forge";
import { PDFDocument, StandardFonts, degrees } from "pdf-lib";
import {
  getPdfInfo, normalizePdf, findAnchors, renderCompleted, sealPdf, sha256Hex, PdfError, DEFAULT_DISCLOSURE,
  type RenderInput, type SealOptions,
} from "../../lib/pdf";
import { generateSelfSignedP12 } from "../../scripts/generate-signing-cert";

function png(w = 120, h = 40): Uint8Array {
  const rows: Buffer[] = [];
  for (let y = 0; y < h; y++) {
    const r = Buffer.alloc(1 + w * 4);
    for (let x = 0; x < w; x++) {
      const yy = h / 2 + (h / 3.3) * Math.sin(x / 9);
      const a = Math.abs(y - yy) < 2 ? 255 : 0;
      r.set([20, 20, 20, a], 1 + x * 4);
    }
    rows.push(r);
  }
  const chunk = (t: string, d: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(d.length);
    const td = Buffer.concat([Buffer.from(t), d]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr.set([8, 6, 0, 0, 0], 8);
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.concat(rows))), chunk("IEND", Buffer.alloc(0))]));
}

async function samplePdf(pages: number, opts: { rotate?: number; form?: boolean; anchor?: boolean } = {}): Promise<Uint8Array> {
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) {
    const p = d.addPage([612, 792]);
    p.drawText(`SaaS Services Order Form - page ${i + 1}`, { x: 60, y: 720, size: 16, font: f });
    if (opts.anchor) { p.drawText("Customer signature: ", { x: 60, y: 160, size: 11, font: f }); p.drawText("/sig1/", { x: 170, y: 160, size: 11, font: f }); }
    if (opts.rotate) p.setRotation(degrees(opts.rotate));
  }
  if (opts.form) { const tf = d.getForm().createTextField("company"); tf.setText("Example Co"); tf.addToPage(d.getPage(0), { x: 60, y: 600, width: 200, height: 20 }); }
  return d.save();
}

let seal: SealOptions;
beforeAll(() => {
  const g = generateSelfSignedP12();
  seal = { p12: g.p12, passphrase: g.passphrase, name: "Acme Inc.", reason: "Signed and sealed by Imagine Sign", location: "", contactInfo: "sign@example.com" };
});

describe("pdf engine", () => {
  it("getPdfInfo reports displayed size with rotation", async () => {
    const info = await getPdfInfo(await samplePdf(2, { rotate: 90 }));
    expect(info.pageCount).toBe(2);
    expect(info.pages[0]).toMatchObject({ width: 792, height: 612, rotation: 90 });
    expect(info.encrypted).toBe(false);
  });

  it("normalizePdf flattens AcroForm and rejects junk", async () => {
    const withForm = await samplePdf(1, { form: true });
    expect((await getPdfInfo(withForm)).hasAcroForm).toBe(true);
    const n = await normalizePdf(withForm);
    expect((await getPdfInfo(n)).hasAcroForm).toBe(false);
    await expect(normalizePdf(new TextEncoder().encode("hello"))).rejects.toBeInstanceOf(PdfError);
  });

  it("findAnchors locates /sig1/ on every page", async () => {
    const hits = await findAnchors(await samplePdf(2, { anchor: true }), ["/sig1/", "nope"]);
    expect(hits.filter((h) => h.anchor === "/sig1/")).toHaveLength(2);
    const h = hits[0];
    expect(h.x).toBeGreaterThan(0.25); expect(h.x).toBeLessThan(0.3);   // 170/612 = 0.278
    expect(h.y).toBeGreaterThan(0.77); expect(h.y).toBeLessThan(0.8);   // (792-160-11)/792 = 0.784
  });

  it("renders, certifies, seals; CMS digest covers the ByteRange", async () => {
    const a = await samplePdf(2, { anchor: true });
    const b = await samplePdf(1, { rotate: 90 });
    const sig = png();
    const t0 = "2026-10-06T18:00:00Z";
    const input: RenderInput = {
      documents: [{ name: "Order Form.pdf", bytes: a }, { name: "Exhibit A.pdf", bytes: b }],
      envelopeId: "8B0C6A52-3F7E-4F55-9D0B-2A51A0C1B9E1",
      stampEnvelopeId: true,
      fields: [
        { id: "f1", documentIndex: 0, page: 1, x: 0.3, y: 0.76, width: 0.3, height: 0.06, type: "signature", value: null, imagePng: sig },
        { id: "f2", documentIndex: 0, page: 1, x: 0.65, y: 0.78, width: 0.2, height: 0.03, type: "date_signed", value: "10/6/2026" },
        { id: "f3", documentIndex: 0, page: 0, x: 0.1, y: 0.3, width: 0.35, height: 0.03, type: "name", value: "Jane Doe — CEO ✓" },
        { id: "f4", documentIndex: 0, page: 0, x: 0.1, y: 0.4, width: 0.03, height: 0.03, type: "checkbox", value: "true" },
        { id: "f5", documentIndex: 0, page: 0, x: 0.2, y: 0.4, width: 0.03, height: 0.03, type: "radio", value: "a", optionValue: "a" },
        { id: "f6", documentIndex: 0, page: 0, x: 0.1, y: 0.5, width: 0.2, height: 0.05, type: "text", value: "A very long note that will not fit on one line in this narrow box" },
        { id: "f7", documentIndex: 1, page: 0, x: 0.5, y: 0.5, width: 0.2, height: 0.06, type: "initials", value: null, imagePng: sig },
        { id: "f8", documentIndex: 1, page: 0, x: 0.1, y: 0.1, width: 0.3, height: 0.04, type: "company", value: "Example Co" },
        { id: "f9", documentIndex: 0, page: 0, x: 0.1, y: 0.6, width: 0.2, height: 0.04, type: "note", value: "internal" },
      ],
      certificate: {
        envelopeId: "8B0C6A52-3F7E-4F55-9D0B-2A51A0C1B9E1",
        subject: "Acme Corp x Example Co - SaaS Services Order Form",
        status: "completed",
        timezone: "America/Los_Angeles",
        documents: [{ name: "Order Form.pdf", pageCount: 2, sha256: sha256Hex(a) }, { name: "Exhibit A.pdf", pageCount: 1, sha256: sha256Hex(b) }],
        signatureCount: 2, initialsCount: 1,
        sender: { name: "Alex Sender", email: "sender@example.com", ip: "73.15.2.9", company: "Acme Inc." },
        createdAt: t0, sentAt: t0, completedAt: "2026-10-06T19:12:44Z",
        recipients: [
          { name: "Casey Copy", email: "cc@example.com", role: "cc", routingOrder: 3, status: "completed", securityLevel: "Email, Account Authentication (None)", sentAt: "2026-10-06T19:12:44Z" },
          { name: "Jane Doe", email: "jane@example.com", role: "signer", routingOrder: 1, status: "completed", securityLevel: "Email, Account Authentication (None)", signatureImagePng: sig, signatureAdoption: "Drawn on Device", ip: "104.28.1.4", location: "San Francisco, CA, US", userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 Mobile Safari", sentAt: t0, viewedAt: "2026-10-06T18:30:00Z", signedAt: "2026-10-06T18:31:10Z", consent: { acceptedAt: "2026-10-06T18:30:05Z", id: "c1a2" } },
          { name: "Alex Sender", email: "sender@example.com", role: "signer", routingOrder: 2, status: "completed", securityLevel: "Email, Access Code", signatureImagePng: sig, signatureAdoption: "Pre-selected Style", ip: "73.15.2.9", sentAt: "2026-10-06T18:31:11Z", viewedAt: "2026-10-06T19:12:00Z", signedAt: "2026-10-06T19:12:44Z", consent: { acceptedAt: "2026-10-06T19:12:02Z", id: "c3b4" } },
        ],
        events: Array.from({ length: 45 }, (_, i) => ({ at: new Date(Date.parse(t0) + i * 60000).toISOString(), type: "x", description: i % 3 ? "Viewed the envelope" : "Reminder email sent to Jane Doe (jane@example.com) because the envelope is still waiting", actor: i % 2 ? "Jane Doe" : "Alex Sender", ip: "1.2.3.4" })),
        disclosureText: DEFAULT_DISCLOSURE,
      },
    };
    const out = await renderCompleted(input);
    expect(out.certificatePageCount).toBeGreaterThanOrEqual(2);
    const combinedInfo = await getPdfInfo(out.combined);
    expect(combinedInfo.pageCount).toBe(3 + out.certificatePageCount);
    expect((await getPdfInfo(out.certificate)).pageCount).toBe(out.certificatePageCount);

    const sealed = await sealPdf(out.combined, seal);
    const s = Buffer.from(sealed).toString("latin1");
    expect(s).toMatch(/adbe\.pkcs7\.detached/);
    const br = s.match(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/)!.slice(1).map(Number);
    const signedData = Buffer.concat([Buffer.from(sealed.subarray(br[0], br[0] + br[1])), Buffer.from(sealed.subarray(br[2], br[2] + br[3]))]);
    let hex = s.slice(br[0] + br[1] + 1, br[2] - 1).replace(/(00)+$/, "");
    if (hex.length % 2) hex += "0";
    const p7 = forge.pkcs7.messageFromAsn1(forge.asn1.fromDer(forge.util.hexToBytes(hex))) as unknown as { rawCapture: { authenticatedAttributes: Array<{ value: Array<{ value: unknown }> }> } };
    const md = p7.rawCapture.authenticatedAttributes.find((a) => forge.asn1.derToOid(a.value[0].value as string) === forge.pki.oids.messageDigest)!;
    const digest = ((md.value[1].value as Array<{ value: string }>)[0]).value;
    expect(Buffer.from(digest, "binary").toString("hex")).toBe(sha256Hex(new Uint8Array(signedData)));

    // tamper => different file hash
    const t = Buffer.from(sealed); t[300] ^= 0xff;
    expect(sha256Hex(new Uint8Array(t))).not.toBe(sha256Hex(sealed));

    mkdirSync("tests/pdf/out", { recursive: true });
    writeFileSync("tests/pdf/out/sample-completed.pdf", sealed);
    writeFileSync("tests/pdf/out/sample-certificate.pdf", out.certificate);
  });

  it("rejects a field on a missing page", async () => {
    const a = await samplePdf(1);
    await expect(renderCompleted({
      documents: [{ name: "a.pdf", bytes: a }], envelopeId: "E", stampEnvelopeId: false,
      fields: [{ id: "x", documentIndex: 0, page: 5, x: 0, y: 0, width: 0.1, height: 0.1, type: "text", value: "x" }],
      certificate: { envelopeId: "E", subject: "s", status: "completed", timezone: "UTC", documents: [], signatureCount: 0, initialsCount: 0, sender: { name: "S", email: "s@x" }, createdAt: "2026-10-06T00:00:00Z", recipients: [], events: [], disclosureText: "" },
    })).rejects.toBeInstanceOf(PdfError);
  });
});
