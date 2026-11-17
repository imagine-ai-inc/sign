import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireUser, isAdmin } from "@/lib/auth";
import { AppError, assertView, canEdit } from "@/lib/services/access";
import { getBundle, getEvents, getComments } from "@/lib/services/envelopes";
import { listUsers } from "@/lib/services/users";
import { sql } from "@/lib/db";
import { EnvelopeStatus } from "@/components/status";
import { fmtDateTime, envelopeIdDisplay } from "@/lib/format";
import { DetailsActions } from "@/components/agreements/details-actions";
import { RecipientsCard } from "@/components/agreements/recipients-card";
import { DocumentsCard } from "@/components/agreements/documents-card";
import { CommentsPanel } from "@/components/agreements/comments-panel";
import { ActivityCard } from "@/components/agreements/activity-card";
import { CopyButton } from "@/components/agreements/copy-button";

export default async function EnvelopeDetailsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ history?: string; correct?: string; download?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  let env;
  try { env = await assertView(user, id); } catch (e) { if (e instanceof AppError && e.status === 404) notFound(); throw e; }
  if (env.status === "draft") redirect(`/envelopes/${id}/prepare`);
  if (env.status === "template") redirect("/templates");
  const [bundle, events, comments, users, collaborators] = await Promise.all([
    getBundle(id), getEvents(id), getComments(id, true), listUsers(user),
    sql<{ userId: string; permission: "view" | "edit" | "manage" }[]>`select user_id, permission from sign.envelope_collaborators where envelope_id = ${id}`,
  ]);
  const editable = await canEdit(user, env);
  const mine = bundle.recipients.find((r) => r.email.toLowerCase() === user.email.toLowerCase() && (r.status === "sent" || r.status === "delivered") && r.role !== "cc");
  const tz = user.timezone;
  const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);
  return (
    <main className="max-w-[1180px] mx-auto px-6 py-6">
      <Link href="/agreements" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ChevronLeft size={16} /> Agreements</Link>
      <div className="mt-3 rounded-lg bg-white border border-hairline p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[22px] font-semibold leading-tight">{env.subject || "Untitled envelope"}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-ink-2">
              <EnvelopeStatus status={env.status} myAction={!!mine} />
              <span>From: <span className="text-ink">{bundle.owner?.name || env.senderName}</span> ({bundle.owner?.email || env.senderEmail})</span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12.5px] text-muted">
              <span>Envelope ID: <span className="font-mono text-ink-2">{envelopeIdDisplay(env.id)}</span> <CopyButton text={envelopeIdDisplay(env.id)} /></span>
              {env.sentAt ? <span>Sent: {fmtDateTime(env.sentAt, tz)}</span> : null}
              <span>Last change: {fmtDateTime(env.lastActivityAt, tz)}</span>
              {env.status === "sent" && env.expiresAt ? <span>Expires: {fmtDateTime(env.expiresAt, tz)}</span> : null}
              {env.completedAt ? <span>Completed: {fmtDateTime(env.completedAt, tz)}</span> : null}
              {env.voidedAt ? <span>Voided: {fmtDateTime(env.voidedAt, tz)}{env.voidReason ? ` · ${env.voidReason}` : ""}</span> : null}
            </div>
          </div>
          <DetailsActions
            envelope={{ id: env.id, subject: env.subject, message: env.message, status: env.status, visibility: env.visibility, expireAfterDays: env.expireAfterDays, reminderEnabled: env.reminderEnabled, completedFileId: env.completedFileId, certificateFileId: env.certificateFileId, ownerId: env.ownerId, deletedAt: iso(env.deletedAt) }}
            recipients={bundle.recipients.map((r) => ({ id: r.id, name: r.name, email: r.email, role: r.role, status: r.status }))}
            documents={bundle.documents.map((d) => ({ id: d.id, name: d.name, fileId: d.fileId }))}
            events={events.map((e) => ({ id: e.id, type: e.type, description: e.description, ip: e.ip, hash: e.hash, createdAt: new Date(e.createdAt).toISOString() }))}
            users={users.filter((u) => u.status !== "disabled").map((u) => ({ id: u.id, name: u.name, email: u.email }))}
            collaborators={collaborators}
            canEdit={editable}
            isAdmin={isAdmin(user)}
            isOwner={env.ownerId === user.id}
            mineToSign={!!mine}
            timezone={tz}
            openHistory={sp.history === "1"}
            openCorrect={sp.correct === "1"}
            autoDownload={sp.download === "1"}
          />
        </div>
      </div>
      <div className="mt-5 grid lg:grid-cols-[1fr_360px] gap-5 items-start">
        <div className="space-y-5 min-w-0">
          <RecipientsCard
            signingOrder={env.signingOrder}
            recipients={bundle.recipients.map((r) => ({ id: r.id, name: r.name, email: r.email, role: r.role, status: r.status, routingOrder: r.routingOrder, colorIndex: r.colorIndex, sentAt: iso(r.sentAt), deliveredAt: iso(r.deliveredAt), completedAt: iso(r.completedAt), declinedAt: iso(r.declinedAt), declineReason: r.declineReason, replacedBy: r.replacedBy }))}
            timezone={tz}
          />
          <DocumentsCard
            status={env.status}
            documents={bundle.documents.map((d) => ({ id: d.id, name: d.name, fileId: d.fileId, pageCount: d.pageCount }))}
            completedFileId={env.completedFileId}
            certificateFileId={env.certificateFileId}
          />
          <ActivityCard events={events.slice(-12).reverse().map((e) => ({ id: e.id, description: e.description, createdAt: new Date(e.createdAt).toISOString(), ip: e.ip }))} timezone={tz} />
        </div>
        <CommentsPanel envelopeId={env.id} allowed={env.allowComments} comments={comments.map((c) => ({ id: c.id, body: c.body, visibility: c.visibility, authorName: c.authorName, authorEmail: c.authorEmail, createdAt: new Date(c.createdAt).toISOString() }))} timezone={tz} />
      </div>
    </main>
  );
}
