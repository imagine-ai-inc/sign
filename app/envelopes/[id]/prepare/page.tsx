import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { assertEdit, AppError } from "@/lib/services/access";
import { getBundle } from "@/lib/services/envelopes";
import { EnvelopeEditor } from "@/components/builder/envelope-editor";

export const metadata = { title: "Prepare envelope" };

export default async function PreparePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ me?: string }> }) {
  const { id } = await params;
  const { me } = await searchParams;
  const user = await requireUser();
  try {
    await assertEdit(user, id);
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
  const b = await getBundle(id);
  if (b.envelope.status !== "draft" && b.envelope.status !== "template") redirect(`/agreements/${id}`);
  const [template] = b.envelope.status === "template"
    ? await sql<{ id: string; name: string; description: string; shared: boolean }[]>`select id, name, description, shared from sign.templates where envelope_id = ${id}`
    : [];
  return (
    <EnvelopeEditor
      me={{ name: user.name, email: user.email }}
      startOnlyMe={me === "1"}
      template={template ?? null}
      envelope={{
        id: b.envelope.id, subject: b.envelope.subject, message: b.envelope.message, signingOrder: b.envelope.signingOrder,
        reminderEnabled: b.envelope.reminderEnabled, reminderDelayDays: b.envelope.reminderDelayDays, reminderFrequencyDays: b.envelope.reminderFrequencyDays,
        expireAfterDays: b.envelope.expireAfterDays, expireWarnDays: b.envelope.expireWarnDays, allowReassign: b.envelope.allowReassign,
        allowComments: b.envelope.allowComments, visibility: b.envelope.visibility,
      }}
      documents={b.documents.map((d) => ({ id: d.id, name: d.name, pageCount: d.pageCount, fileId: d.fileId, position: d.position }))}
      recipients={b.recipients.filter((r) => r.status !== "replaced").map((r) => ({
        id: r.id, name: r.name, email: r.email, role: r.role, routingOrder: r.routingOrder, colorIndex: r.colorIndex,
        templateRole: r.templateRole, privateMessage: r.privateMessage, hasAccessCode: !!r.accessCodeHash,
      }))}
    />
  );
}
