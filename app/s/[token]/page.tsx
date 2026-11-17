import { env } from "@/lib/env";
import { brand } from "@/lib/brand";
import { cookies } from "next/headers";
import { accessCookieName, loadSignerSession, markViewed, resolveToken } from "@/lib/services/signing";
import { DEFAULT_DISCLOSURE } from "@/lib/pdf";
import { requestMeta } from "@/lib/request";
import { envelopeIdDisplay, fmtDate, DEFAULT_TZ } from "@/lib/format";
import { sql } from "@/lib/db";
import { SignerApp } from "@/components/signer/signer-app";
import { SignerFrame } from "@/components/signer/signer-frame";
import { InvalidLink } from "@/components/signer/status-screens";
import type { SignerData } from "@/components/signer/types";

export const metadata = { title: "Review and sign", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function SignerPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveToken(token).catch(() => null);
  if (!resolved) return <SignerFrame><InvalidLink /></SignerFrame>;
  const jar = await cookies();
  const session = await loadSignerSession(token, jar.get(accessCookieName(resolved.recipient.id))?.value ?? null);
  if (!session) return <SignerFrame><InvalidLink /></SignerFrame>;
  if (session.state === "active" && !session.needsAccessCode) await markViewed(token, await requestMeta()).catch(() => {});

  const [ws] = await sql<{ settings: Record<string, string> }[]>`select settings from sign.workspaces where id = ${session.envelope.workspaceId}`;
  const tz = ws?.settings?.timezone || DEFAULT_TZ;
  const { envelope: e, recipient: r } = session;
  const recById = new Map<string, { name: string; colorIndex: number }>([[r.id, { name: r.name, colorIndex: r.colorIndex }], ...session.otherRecipients.map((o) => [o.id, { name: o.name, colorIndex: o.colorIndex }] as [string, { name: string; colorIndex: number }])]);
  const data: SignerData = {
    token,
    state: session.state,
    needsAccessCode: session.needsAccessCode,
    envelope: {
      id: e.id,
      idDisplay: envelopeIdDisplay(e.id),
      subject: e.subject,
      message: e.message,
      status: e.status,
      senderName: e.senderName || brand.company || brand.name,
      senderEmail: e.senderEmail || env.supportEmail(),
      allowReassign: e.allowReassign,
      voidReason: e.voidReason,
      expiresAt: e.expiresAt ? new Date(e.expiresAt).toISOString() : null,
      hasCompletedFile: !!e.completedFileId,
      hasCertificate: !!e.certificateFileId,
    },
    recipient: {
      id: r.id, name: r.name, email: r.email, role: r.role, status: r.status, consented: !!r.consentedAt,
      adoption: r.signatureAdoption ? { fullName: r.signatureAdoption.fullName, initials: r.signatureAdoption.initials, style: r.signatureAdoption.style, signatureId: r.signatureAdoption.signatureId ?? null, hasStamp: !!r.signatureAdoption.stampFileId } : null,
      colorIndex: r.colorIndex,
    },
    documents: session.documents.map((d) => ({ id: d.id, name: d.name, pageCount: d.pageCount, pages: d.pages })),
    fields: session.fields.map((f) => ({
      id: f.id, documentId: f.documentId, recipientId: f.recipientId, mine: f.recipientId === r.id, type: f.type, page: f.page,
      x: f.x, y: f.y, width: f.width, height: f.height, required: f.required, readOnly: f.readOnly, label: f.label, options: f.options ?? {}, value: f.value,
      ownerName: recById.get(f.recipientId)?.name ?? "", ownerColorIndex: recById.get(f.recipientId)?.colorIndex ?? 0,
    })),
    otherRecipients: session.otherRecipients,
    earlierSigners: session.otherRecipients.filter((o) => o.routingOrder < r.routingOrder && o.role !== "cc" && o.status !== "completed").map((o) => o.name),
    disclosure: DEFAULT_DISCLOSURE,
    todayLabel: fmtDate(new Date(), tz),
    otherValues: Object.fromEntries(session.fields.filter((f) => f.recipientId !== r.id && f.label && f.value != null).map((f) => [f.label as string, f.value as string])),
  };
  return <SignerApp data={data} />;
}
