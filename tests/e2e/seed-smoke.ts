/** Seeds QA data owned by the test bot (all addresses @resend.dev) and prints URLs to smoke test. */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { sql } from "@/lib/db";
import * as E from "@/lib/services/envelopes";
import * as S from "@/lib/services/signing";
import * as T from "@/lib/services/templates";
import { issueSigningToken } from "@/lib/services/notify";
import type { AppUser } from "@/lib/types";

const meta = { ip: "203.0.113.9", userAgent: "imagine-sign-smoke", geo: { city: "San Francisco", region: "CA", country: "US" } };
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

async function pdf(title: string) {
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.Helvetica);
  const p = d.addPage([612, 792]);
  p.drawText(title, { x: 60, y: 720, size: 16, font: f, color: rgb(0.1, 0.1, 0.1) });
  p.drawText("QA document. Signature: /sig1/   Second signer: /sig2/", { x: 60, y: 300, size: 11, font: f });
  return d.save();
}

async function make(user: AppUser, subject: string, recipients: { name: string; email: string }[]) {
  const env = await E.createDraft(user, { subject, message: "QA run, no real people involved." });
  const doc = await E.addDocumentBytes(env, { name: `${subject}.pdf`, bytes: await pdf(subject), createdBy: user.id });
  await E.updateEnvelopeSettings(env.id, { signingOrder: true });
  const [fresh] = await sql`select * from sign.envelopes where id = ${env.id}`;
  const recs = await E.writeRecipients(fresh as never, recipients.map((r, i) => ({ ...r, role: "signer" as const, routingOrder: i + 1 })));
  await E.writeFields(fresh as never, recs.flatMap((r, i) => [
    { documentId: doc.id, recipientId: r.id, type: "signature" as const, page: 0, x: 0.15 + i * 0.4, y: 0.5, width: 0.25, height: 0.045 },
    { documentId: doc.id, recipientId: r.id, type: "date_signed" as const, page: 0, x: 0.15 + i * 0.4, y: 0.56, width: 0.16, height: 0.025 },
    { documentId: doc.id, recipientId: r.id, type: "text" as const, page: 0, x: 0.15 + i * 0.4, y: 0.6, width: 0.25, height: 0.025, label: "company_name", required: false },
  ]));
  return { env, recs };
}

async function sign(token: string) {
  await S.markViewed(token, meta);
  await S.recordConsent(token, meta);
  await S.adoptSignature(token, { style: "font", font: "Dancing Script", fullName: "QA Signer", initials: "QS", signaturePng: PNG, initialsPng: PNG }, meta);
  const [t] = await sql<{ recipientId: string }[]>`select recipient_id from sign.signing_tokens order by created_at desc limit 1`;
  void t;
}

async function main() {
  const [bot] = await sql<AppUser[]>`select * from sign.users where email = 'delivered+bot@resend.dev'`;
  const draft = await make(bot, "QA draft order form", [{ name: "QA Alpha", email: "delivered+alpha@resend.dev" }, { name: "QA Beta", email: "delivered+beta@resend.dev" }]);
  const sent = await make(bot, "QA in progress order form", [{ name: "QA Gamma", email: "delivered+gamma@resend.dev" }, { name: "QA Delta", email: "delivered+delta@resend.dev" }]);
  await E.sendEnvelope({ user: bot, meta }, sent.env.id);
  const activeToken = await issueSigningToken(sent.recs[0].id, null);
  const waitingToken = await issueSigningToken(sent.recs[1].id, null);

  const done = await make(bot, "QA completed order form", [{ name: "QA Eps", email: "delivered+eps@resend.dev" }]);
  await E.sendEnvelope({ user: bot, meta }, done.env.id);
  const dt = await issueSigningToken(done.recs[0].id, null);
  await sign(dt);
  const fields = await sql<{ id: string; type: string }[]>`select id, type from sign.fields where recipient_id = ${done.recs[0].id}`;
  await S.completeRecipient(dt, Object.fromEntries(fields.map((f) => [f.id, f.type === "signature" ? "signed" : f.type === "text" ? "QA Co" : ""])), meta);

  const tpl = await T.createTemplate(bot, { name: "QA Order Form template", description: "QA" });
  const [tEnv] = await sql`select * from sign.envelopes where id = ${tpl.envelopeId}`;
  await E.addDocumentBytes(tEnv as never, { name: "Order Form template.pdf", bytes: await pdf("Order Form template"), createdBy: bot.id });

  console.log(JSON.stringify({
    draft: draft.env.id, sent: sent.env.id, completed: done.env.id, template: tpl.template.id, templateEnvelope: tpl.envelopeId,
    activeToken, waitingToken, completedToken: dt,
  }));
  await sql.end();
}
main().catch(async (e) => { console.error("SEED FAILED", e); await sql.end(); process.exit(1); });
