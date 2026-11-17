/**
 * Full backend flow against the real database + storage + Resend test inboxes:
 * draft -> document -> 2 signers in order -> fields -> send -> signer 1 signs -> signer 2 signs -> completed PDF + certificate.
 * Run: NODE_OPTIONS="--conditions=react-server" pnpm tsx tests/e2e/backend-flow.ts
 */
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { sql } from "@/lib/db";
import * as E from "@/lib/services/envelopes";
import * as S from "@/lib/services/signing";
import { issueSigningToken } from "@/lib/services/notify";
import { getObject } from "@/lib/storage";
import type { AppUser } from "@/lib/types";

function png(width: number, height: number, draw: (x: number, y: number) => boolean): string {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const o = y * (width * 4 + 1) + 1 + x * 4;
      const on = draw(x, y);
      raw[o] = 20; raw[o + 1] = 20; raw[o + 2] = 20; raw[o + 3] = on ? 255 : 0;
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const out = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
  return "data:image/png;base64," + out.toString("base64");
}
const sigPng = png(300, 80, (x, y) => Math.abs(y - (40 + 22 * Math.sin(x / 18))) < 2.2);
const iniPng = png(120, 80, (x, y) => Math.abs(y - (40 + 18 * Math.cos(x / 10))) < 2.2);
const meta = { ip: "203.0.113.7", userAgent: "imagine-sign-e2e", geo: { city: "San Francisco", region: "CA", country: "US" } };

async function samplePdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  for (let p = 0; p < 2; p++) {
    const page = doc.addPage([612, 792]);
    page.drawText(p === 0 ? "Acme Inc x Testco - SaaS Services Order Form" : "Signatures", { x: 60, y: 720, size: 16, font: bold, color: rgb(0.08, 0.08, 0.08) });
    page.drawText("This is an automated end-to-end test document.", { x: 60, y: 690, size: 11, font });
    if (p === 1) {
      page.drawText("Customer signature: /sig1/", { x: 60, y: 300, size: 11, font });
      page.drawText("Acme signature: /sig2/", { x: 60, y: 200, size: 11, font });
    }
  }
  return doc.save();
}

async function main() {
  const [user] = await sql<AppUser[]>`select * from sign.users where email = 'delivered+bot@resend.dev'`;
  const env = await E.createDraft(user, { subject: "E2E test: Acme Inc x Testco - Order Form", message: "Automated test, please ignore." });
  console.log("draft", env.id);
  const doc = await E.addDocumentBytes(env, { name: "Testco Order Form.pdf", bytes: await samplePdf(), createdBy: user.id });
  await E.updateEnvelopeSettings(env.id, { signingOrder: true });
  const [fresh] = await sql`select * from sign.envelopes where id = ${env.id}`;
  const recs = await E.writeRecipients(fresh as never, [
    { name: "Dana Test", email: "delivered+dana@resend.dev", role: "signer", routingOrder: 1 },
    { name: "Sam Test", email: "delivered+sam@resend.dev", role: "signer", routingOrder: 2 },
    { name: "Casey Test", email: "delivered+casey@resend.dev", role: "cc", routingOrder: 3 },
  ]);
  const [r1, r2] = recs;
  const anchors = await E.resolveAnchorFields(fresh as never, [
    { anchor: "/sig1/", recipientId: r1.id, type: "signature", offsetX: 0, offsetY: -30, width: 150, height: 36 },
    { anchor: "/sig2/", recipientId: r2.id, type: "signature", offsetX: 0, offsetY: -30, width: 150, height: 36 },
  ]);
  console.log("anchor fields", anchors.length);
  await E.writeFields(fresh as never, [
    ...anchors,
    { documentId: doc.id, recipientId: r1.id, type: "date_signed", page: 1, x: 0.55, y: 0.58, width: 0.16, height: 0.025 },
    { documentId: doc.id, recipientId: r1.id, type: "name", page: 1, x: 0.1, y: 0.66, width: 0.3, height: 0.025 },
    { documentId: doc.id, recipientId: r1.id, type: "title", page: 1, x: 0.45, y: 0.66, width: 0.25, height: 0.025, label: "customer_title" },
    { documentId: doc.id, recipientId: r1.id, type: "checkbox", page: 0, x: 0.1, y: 0.2, width: 0.023, height: 0.018, required: true, label: "agree_terms" },
    { documentId: doc.id, recipientId: r1.id, type: "initials", page: 0, x: 0.8, y: 0.9, width: 0.08, height: 0.045 },
    { documentId: doc.id, recipientId: r2.id, type: "date_signed", page: 1, x: 0.55, y: 0.71, width: 0.16, height: 0.025 },
  ]);
  const bundle = await E.getBundle(env.id);
  console.log("validate:", E.validateForSend(bundle));
  await E.sendEnvelope({ user, meta, via: "web" }, env.id);
  let [st] = await sql<{ status: string }[]>`select status from sign.envelopes where id = ${env.id}`;
  console.log("after send:", st.status, (await sql`select name, status from sign.recipients where envelope_id = ${env.id} order by routing_order`).map((r) => `${r.name}:${r.status}`).join(", "));

  // signer 1
  const t1 = await issueSigningToken(r1.id, null);
  await S.markViewed(t1, meta);
  await S.recordConsent(t1, meta);
  await S.adoptSignature(t1, { style: "draw", fullName: "Dana Test", initials: "DT", signaturePng: sigPng, initialsPng: iniPng }, meta);
  const f1 = await sql<{ id: string; type: string }[]>`select id, type from sign.fields where recipient_id = ${r1.id}`;
  const v1: Record<string, string> = {};
  for (const f of f1) v1[f.id] = f.type === "signature" ? "signed" : f.type === "initials" ? "initialed" : f.type === "checkbox" ? "true" : f.type === "title" ? "Head of Growth" : "";
  await S.completeRecipient(t1, v1, meta);
  console.log("after signer 1:", (await sql`select name, status from sign.recipients where envelope_id = ${env.id} order by routing_order`).map((r) => `${r.name}:${r.status}`).join(", "));

  // signer 2
  const t2 = await issueSigningToken(r2.id, null);
  await S.markViewed(t2, meta);
  await S.recordConsent(t2, meta);
  await S.adoptSignature(t2, { style: "font", font: "Dancing Script", fullName: "Sam Test", initials: "ST", signaturePng: sigPng, initialsPng: iniPng }, meta);
  const f2 = await sql<{ id: string; type: string }[]>`select id, type from sign.fields where recipient_id = ${r2.id}`;
  const v2: Record<string, string> = {};
  for (const f of f2) v2[f.id] = f.type === "signature" ? "signed" : "";
  await S.completeRecipient(t2, v2, meta);

  [st] = await sql<{ status: string }[]>`select status from sign.envelopes where id = ${env.id}`;
  const [done] = await sql<{ status: string; completedFileId: string | null; completedSha256: string | null; certificateFileId: string | null }[]>`select status, completed_file_id, completed_sha256, certificate_file_id from sign.envelopes where id = ${env.id}`;
  console.log("final:", done.status, "file", !!done.completedFileId, "sha", done.completedSha256?.slice(0, 16));
  if (done.completedFileId) {
    const [f] = await sql<{ path: string }[]>`select path from sign.files where id = ${done.completedFileId}`;
    const bytes = await getObject(f.path);
    writeFileSync(process.env.OUT || "/tmp/isign-e2e-completed.pdf", bytes);
    console.log("wrote completed pdf", bytes.byteLength, "bytes");
  }
  const events = await sql<{ type: string }[]>`select type from sign.events where envelope_id = ${env.id} order by id`;
  console.log("events:", events.map((e) => e.type).join(" > "));
  const emails = await sql<{ type: string; toEmail: string; status: string; error: string | null }[]>`select type, to_email, status, error from sign.emails where envelope_id = ${env.id} order by created_at`;
  console.log("emails:", emails.map((e) => `${e.type}->${e.toEmail}:${e.status}${e.error ? "(" + e.error + ")" : ""}`).join(" | "));
  await sql.end();
}
main().catch(async (e) => { console.error("E2E FAILED", e); await sql.end(); process.exit(1); });
